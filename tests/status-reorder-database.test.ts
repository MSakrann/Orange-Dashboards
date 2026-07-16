// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readIfPresent = (path: string) =>
  existsSync(resolve(root, path)) ? read(path) : "";
const statusMigration = readIfPresent("supabase/migrations/0003_status_reorder.sql");

describe("status reorder and replacement migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable set search_path = ''
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create publication supabase_realtime;
    `);
    await db.exec(read("supabase/migrations/0001_core_schema.sql"));
    await db.exec(read("supabase/migrations/0002_security_audit_realtime.sql"));
    await db.exec(statusMigration);
    await db.exec(read("supabase/seed.sql"));
    await db.exec(`
      insert into auth.users (id) values ('90000000-0000-4000-8000-000000000001');
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('90000000-0000-4000-8000-000000000001', 'status-admin@test.local', 'Admin');
      select set_config(
        'request.jwt.claim.sub',
        '90000000-0000-4000-8000-000000000001',
        false
      );
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec(`
      reset role;
      select set_config(
        'request.jwt.claim.sub',
        '90000000-0000-4000-8000-000000000001',
        false
      );
    `);
  });

  it("is fully reapplicable", async () => {
    await expect(db.exec(statusMigration)).resolves.toBeDefined();
  });

  it("uses admin-only grants and empty search paths for every status RPC", async () => {
    const functions = await db.query<{
      name: string;
      secure: boolean;
      empty_path: boolean;
      authenticated_execute: boolean;
      anon_execute: boolean;
    }>(`
      select p.proname as name,
             p.prosecdef as secure,
             'search_path=""' = any(coalesce(p.proconfig, array[]::text[])) as empty_path,
             has_function_privilege(
               'authenticated',
               p.oid,
               'execute'
             ) as authenticated_execute,
             has_function_privilege('anon', p.oid, 'execute') as anon_execute
        from pg_proc p
       where p.oid in (
         'public.create_status(uuid,uuid,text,text,text)'::regprocedure,
         'public.reorder_statuses(uuid,uuid[])'::regprocedure,
         'public.replace_and_delete_status(uuid,uuid,uuid,timestamptz)'::regprocedure
       )
       order by p.proname
    `);
    expect(functions.rows).toHaveLength(3);
    expect(functions.rows.every((row) =>
      row.secure && row.empty_path && row.authenticated_execute && !row.anon_execute)).toBe(true);
  });

  it("denies every status RPC to an authenticated non-admin", async () => {
    await db.exec(`
      insert into auth.users (id) values ('90000000-0000-4000-8000-000000000002');
      select set_config(
        'request.jwt.claim.sub',
        '90000000-0000-4000-8000-000000000002',
        false
      );
      set role authenticated;
    `);
    await expect(db.exec(`
      select public.create_status(
        '10000000-0000-4000-8000-000000000001',
        '94000000-0000-4000-8000-000000000001',
        'Denied', '#111111', 'active'
      )
    `)).rejects.toThrow(/admin access required/i);
    await expect(db.exec(`
      select public.reorder_statuses(
        '10000000-0000-4000-8000-000000000001',
        array[]::uuid[]
      )
    `)).rejects.toThrow(/admin access required/i);
    await expect(db.exec(`
      select public.replace_and_delete_status(
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        (
          select updated_at
            from public.statuses
           where id = '20000000-0000-4000-8000-000000000001'
        )
      )
    `)).rejects.toThrow(/admin access required/i);
    await db.exec(`
      reset role;
      select set_config(
        'request.jwt.claim.sub',
        '90000000-0000-4000-8000-000000000001',
        false
      );
    `);
  });

  it("creates status IDs idempotently under the workspace lock and audits changes", async () => {
    const id = "94000000-0000-4000-8000-000000000002";
    await db.exec(`
      delete from public.activity_history;
      select public.create_status(
        '10000000-0000-4000-8000-000000000001',
        '${id}',
        'Review', '#334455', 'risk'
      );
      select public.create_status(
        '10000000-0000-4000-8000-000000000001',
        '${id}',
        'Review', '#334455', 'risk'
      );
    `);
    const created = await db.query<{ count: number; audits: number }>(`
      select count(*)::integer as count,
             (
               select count(*)::integer
                 from public.activity_history
                where entity_id = '${id}' and action = 'insert'
             ) as audits
        from public.statuses
       where id = '${id}'
    `);
    expect(created.rows[0]).toEqual({ count: 1, audits: 1 });
  });

  it("reorders every workspace status atomically without collisions", async () => {
    const workspaceId = "10000000-0000-4000-8000-000000000001";
    const before = await db.query<{ id: string }>(
      `select id from public.statuses where workspace_id = '${workspaceId}' order by sort_order`,
    );
    const reversed = before.rows.map(({ id }) => id).reverse();
    await db.exec(`
      delete from public.activity_history;
      select public.reorder_statuses(
        '${workspaceId}',
        array[${reversed.map((id) => `'${id}'::uuid`).join(",")}]
      )
    `);
    const after = await db.query<{ id: string }>(
      `select id from public.statuses where workspace_id = '${workspaceId}' order by sort_order`,
    );
    expect(after.rows.map(({ id }) => id)).toEqual(reversed);
    const audit = await db.query<{ count: number }>(`
      select count(*)::integer as count
        from public.activity_history
       where entity_type = 'status'
         and action = 'update'
         and entity_id = any(
           array[${reversed.map((id) => `'${id}'::uuid`).join(",")}]
         )
    `);
    expect(audit.rows[0].count).toBe(reversed.length);
  });

  it("rejects cross-workspace and incomplete reorder lists", async () => {
    await expect(db.exec(`
      select public.reorder_statuses(
        '10000000-0000-4000-8000-000000000001',
        array['20000000-0000-4000-8000-000000000005'::uuid]
      )
    `)).rejects.toThrow(/all workspace statuses exactly once/i);
  });

  it("rejects stale deletes and audits replacement updates plus status deletion", async () => {
    await db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('91000000-0000-4000-8000-000000000002', 'replace-audit', 'Replace audit', 98);
      insert into public.statuses
        (id, workspace_id, name, color, sort_order, reporting_category)
      values
        (
          '92000000-0000-4000-8000-000000000002',
          '91000000-0000-4000-8000-000000000002',
          'Source', '#111111', 0, 'active'
        ),
        (
          '92000000-0000-4000-8000-000000000003',
          '91000000-0000-4000-8000-000000000002',
          'Replacement', '#222222', 1, 'completed'
        );
      insert into public.work_items
        (id, workspace_id, title, status_id, sort_order)
      values (
        '93000000-0000-4000-8000-000000000002',
        '91000000-0000-4000-8000-000000000002',
        'Replace me',
        '92000000-0000-4000-8000-000000000002',
        0
      );
    `);

    await expect(db.exec(`
      select public.replace_and_delete_status(
        '91000000-0000-4000-8000-000000000002',
        '92000000-0000-4000-8000-000000000002',
        '92000000-0000-4000-8000-000000000003',
        '2000-01-01T00:00:00Z'
      )
    `)).rejects.toThrow(/changed by someone else/i);

    await db.exec(`
      delete from public.activity_history;
      select public.replace_and_delete_status(
        '91000000-0000-4000-8000-000000000002',
        '92000000-0000-4000-8000-000000000002',
        '92000000-0000-4000-8000-000000000003',
        (select updated_at from public.statuses
          where id = '92000000-0000-4000-8000-000000000002')
      );
    `);
    const audit = await db.query<{ work_item_updates: number; status_deletes: number }>(`
      select
        count(*) filter (
          where entity_id = '93000000-0000-4000-8000-000000000002'
            and entity_type = 'work_item'
            and action = 'update'
        )::integer as work_item_updates,
        count(*) filter (
          where entity_id = '92000000-0000-4000-8000-000000000002'
            and entity_type = 'status'
            and action = 'delete'
        )::integer as status_deletes
      from public.activity_history
    `);
    expect(audit.rows[0]).toEqual({ work_item_updates: 1, status_deletes: 1 });
  });

  it("prevents deleting the final status and cross-workspace replacement", async () => {
    await db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('91000000-0000-4000-8000-000000000001', 'single-status', 'Single status', 99);
      insert into public.statuses
        (id, workspace_id, name, color, sort_order, reporting_category)
      values (
        '92000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000001',
        'Only', '#111111', 0, 'active'
      );
    `);
    await expect(db.exec(`
      select public.replace_and_delete_status(
        '91000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        (select updated_at from public.statuses
          where id = '92000000-0000-4000-8000-000000000001')
      )
    `)).rejects.toThrow(/final status|same workspace/i);
  });

  it("locks workspace tuples and enforces delete timestamps in concurrency contracts", async () => {
    const functions = await db.query<{ name: string; source: string }>(`
      select proname as name, regexp_replace(prosrc, '\\s+', ' ', 'g') as source
        from pg_proc
       where oid in (
         'public.create_status(uuid,uuid,text,text,text)'::regprocedure,
         'public.reorder_statuses(uuid,uuid[])'::regprocedure,
         'public.replace_and_delete_status(uuid,uuid,uuid,timestamptz)'::regprocedure
       )
    `);
    const byName = Object.fromEntries(functions.rows.map((row) => [row.name, row.source]));
    expect(byName.create_status).toMatch(/from public\.workspaces.*for update/i);
    expect(byName.create_status).toMatch(/max\(sort_order\).*\+ 1/i);
    expect(byName.reorder_statuses).toMatch(/from public\.statuses.*for update/i);
    expect(byName.replace_and_delete_status).toMatch(/updated_at.*p_expected_updated_at/i);
  });
});
