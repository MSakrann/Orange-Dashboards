// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readIfPresent = (path: string) =>
  existsSync(resolve(root, path)) ? read(path) : "";
const migration = readIfPresent("supabase/migrations/0004_history_query.sql");
const hardening = readIfPresent("supabase/migrations/0005_hardening.sql");
const adminId = "90000000-0000-4000-8000-000000000001";
const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "10000000-0000-4000-8000-000000000002";

async function expectSqlError(db: PGlite, sql: string, message: RegExp) {
  await db.exec("begin");
  let error: unknown;
  try {
    await db.exec(sql);
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback");
  expect(String(error)).toMatch(message);
}

describe("admin history query migration", () => {
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
    await db.exec(read("supabase/migrations/0003_status_reorder.sql"));
    await db.exec(read("supabase/seed.sql"));
    await db.exec(`
      insert into auth.users (id) values ('${adminId}');
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('${adminId}', 'history-admin@test.local', 'History Admin');
      select set_config('request.jwt.claim.sub', '${adminId}', false);
    `);
    await db.exec(migration);
    await db.exec(hardening);
  });

  afterAll(async () => db.close());

  beforeEach(async () => {
    await db.exec(`
      reset role;
      select set_config('request.jwt.claim.sub', '${adminId}', false);
    `);
  });

  it("is reapplicable and exposes only an authenticated, hardened RPC", async () => {
    await expect(db.exec(`${migration}\n${hardening}`)).resolves.toBeDefined();
    expect(migration).toMatch(
      /revoke all on function public\.query_activity_history\([\s\S]*?\) from anon;/i,
    );
    const result = await db.query<{
      secure: boolean;
      empty_path: boolean;
      authenticated_execute: boolean;
      anon_execute: boolean;
      authenticated_table_select: boolean;
    }>(`
      select p.prosecdef as secure,
             'search_path=""' = any(coalesce(p.proconfig, array[]::text[])) as empty_path,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
             has_function_privilege('anon', p.oid, 'execute') as anon_execute,
             has_table_privilege('authenticated', 'public.activity_history', 'select')
               as authenticated_table_select
        from pg_proc p
       where p.oid = 'public.query_activity_history(text,timestamptz,uuid,text,text,date,date,integer,integer)'
         ::regprocedure
    `);
    expect(result.rows[0]).toEqual({
      secure: true,
      empty_path: true,
      authenticated_execute: true,
      anon_execute: false,
      authenticated_table_select: false,
    });
    const registry = await db.query<{
      anon_select: boolean;
      authenticated_select: boolean;
      resolver_anon_execute: boolean;
      resolver_authenticated_execute: boolean;
      resolver_empty_path: boolean;
      resolver_secure: boolean;
    }>(`
      select has_table_privilege(
               'anon', 'public.workspace_identity_registry', 'select'
             ) as anon_select,
             has_table_privilege(
               'authenticated', 'public.workspace_identity_registry', 'select'
             ) as authenticated_select,
             has_function_privilege(
               'anon', 'public.resolve_history_workspace(text)', 'execute'
             ) as resolver_anon_execute,
             has_function_privilege(
               'authenticated', 'public.resolve_history_workspace(text)', 'execute'
             ) as resolver_authenticated_execute,
             p.prosecdef as resolver_secure,
             'search_path=""' = any(coalesce(p.proconfig, array[]::text[]))
               as resolver_empty_path
        from pg_proc p
       where p.oid = 'public.resolve_history_workspace(text)'::regprocedure
    `);
    expect(registry.rows[0]).toEqual({
      anon_select: false,
      authenticated_select: false,
      resolver_anon_execute: false,
      resolver_authenticated_execute: true,
      resolver_empty_path: true,
      resolver_secure: true,
    });
    const actors = await db.query<{
      anon_execute: boolean;
      authenticated_execute: boolean;
      empty_path: boolean;
      secure: boolean;
      public_execute: boolean;
    }>(`
      select has_function_privilege(
               'anon', p.oid, 'execute'
             ) as anon_execute,
             has_function_privilege(
               'authenticated', p.oid, 'execute'
             ) as authenticated_execute,
             has_function_privilege(
               'public', p.oid, 'execute'
             ) as public_execute,
             p.prosecdef as secure,
             'search_path=""' = any(coalesce(p.proconfig, array[]::text[])) as empty_path
        from pg_proc p
       where p.oid = 'public.list_history_actors(text)'::regprocedure
    `);
    expect(actors.rows[0]).toEqual({
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
      secure: true,
      empty_path: true,
    });
  });

  it("enforces reapplicable text bounds while retaining the seed", async () => {
    const constraints = await db.query<{ constraint_name: string }>(`
      select constraint_name
        from information_schema.table_constraints
       where constraint_schema = 'public'
         and constraint_name in (
           'workspaces_name_length',
           'workspaces_description_length',
           'statuses_name_length',
           'work_items_title_length',
           'work_items_description_length',
           'work_items_priority_length',
           'work_items_assignee_length',
           'comments_author_name_length',
           'comments_body_length'
         )
    `);
    expect(constraints.rows).toHaveLength(9);
    await expectSqlError(db, `
      insert into public.work_items
        (workspace_id, title, status_id, sort_order)
      values
        ('${workspaceA}', repeat('x', 201),
         '20000000-0000-4000-8000-000000000001', 500)
    `, /work_items_title_length/i);
    const seedCount = await db.query<{ count: number }>(`
      select count(*)::int as count from public.work_items
    `);
    expect(seedCount.rows[0].count).toBe(13);
  });

  it("denies authenticated non-admins", async () => {
    await db.exec(`
      insert into auth.users (id) values ('90000000-0000-4000-8000-000000000002');
      select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', false);
      set role authenticated;
    `);
    await expect(db.query(`
      select * from public.query_activity_history(
        'hot-topics', null, null, null, null, null, null, 1, 25
      )
    `)).rejects.toThrow(/admin access required/i);
    await expect(db.query(`
      select * from public.resolve_history_workspace('hot-topics')
    `)).rejects.toThrow(/admin access required/i);
    await expect(db.query(`
      select * from public.list_history_actors('hot-topics')
    `)).rejects.toThrow(/admin access required/i);
  });

  it("returns only retained actors for the requested workspace identity", async () => {
    const otherAdmin = "90000000-0000-4000-8000-000000000003";
    await db.exec(`
      reset role;
      select set_config('request.jwt.claim.sub', '${adminId}', false);
      insert into auth.users (id) values ('${otherAdmin}');
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('${otherAdmin}', 'other@test.local', 'Other Admin');
      delete from public.activity_history;
      insert into public.activity_history
        (actor_id, actor_name, workspace_id, workspace_slug, workspace_name,
         action, entity_type)
      values
        ('${adminId}', 'Retained Admin', '${workspaceA}', 'hot-topics',
         'Hot Topics', 'update', 'work_item'),
        ('${otherAdmin}', 'Other Snapshot', '${workspaceB}', 'platform-development',
         'Platform Development', 'update', 'work_item');
    `);
    const actors = await db.query<{
      actor_id: string;
      display_name: string;
      email: string | null;
    }>(`select * from public.list_history_actors('hot-topics')`);
    expect(actors.rows).toEqual([{
      actor_id: adminId,
      display_name: "History Admin",
      email: "history-admin@test.local",
    }]);
  });

  it("supports idempotent workspace upserts without weakening identity", async () => {
    await expect(db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('${workspaceA}', 'hot-topics', 'Hot Topics Updated', 0)
      on conflict (id) do update set name = excluded.name;
    `)).resolves.toBeDefined();
    const registry = await db.query<{ name: string; slug: string }>(`
      select name, slug
        from public.workspace_identity_registry
       where workspace_id = '${workspaceA}'
    `);
    expect(registry.rows).toEqual([{
      name: "Hot Topics Updated",
      slug: "hot-topics",
    }]);
  });

  it("isolates workspaces and applies actor, action, entity, and date filters", async () => {
    await db.exec(`
      delete from public.activity_history;
      insert into public.activity_history
        (id, actor_id, actor_name, workspace_id, workspace_slug, workspace_name,
         action, entity_type, entity_id, created_at)
      values
        ('70000000-0000-4000-8000-000000000001', '${adminId}', 'Snapshot', '${workspaceA}',
         'hot-topics', 'Hot Topics',
         'update', 'work_item', '30000000-0000-4000-8000-000000000001', '2026-07-14T12:00:00Z'),
        ('70000000-0000-4000-8000-000000000002', null, null, '${workspaceA}',
         'hot-topics', 'Hot Topics',
         'delete', 'comment', '40000000-0000-4000-8000-000000000001', '2026-07-15T12:00:00Z'),
        ('70000000-0000-4000-8000-000000000003', '${adminId}', 'Snapshot', '${workspaceB}',
         'platform-development', 'Platform Development',
         'update', 'work_item', '30000000-0000-4000-8000-000000000002', '2026-07-14T12:00:00Z');
    `);
    const rows = await db.query<{
      id: string;
      actor_email: string | null;
      actor_display_name: string | null;
      total_count: number;
    }>(`
      select id, actor_email, actor_display_name, total_count
        from public.query_activity_history(
          'hot-topics', null, '${adminId}', 'update', 'work_item',
          '2026-07-14', '2026-07-14', 1, 25
        )
    `);
    expect(rows.rows).toEqual([{
      id: "70000000-0000-4000-8000-000000000001",
      actor_email: "history-admin@test.local",
      actor_display_name: "History Admin",
      total_count: 1,
    }]);
  });

  it("uses created_at and id for stable pagination and retains delete history", async () => {
    await db.exec(`
      delete from public.activity_history;
      insert into public.activity_history
        (id, workspace_id, workspace_slug, workspace_name, action, entity_type,
         entity_id, old_values, created_at)
      values
        ('70000000-0000-4000-8000-000000000010', '${workspaceA}',
         'hot-topics', 'Hot Topics', 'delete', 'status',
         '20000000-0000-4000-8000-000000000001', '{"name":"Deleted"}', now() - interval '1 hour'),
        ('70000000-0000-4000-8000-000000000011', '${workspaceA}',
         'hot-topics', 'Hot Topics', 'delete', 'status',
         '20000000-0000-4000-8000-000000000002', '{"name":"Also deleted"}', now() - interval '1 hour');
    `);
    const first = await db.query<{ id: string; old_values: { name: string }; total_count: number }>(`
      select id, old_values, total_count
        from public.query_activity_history(
          'hot-topics', null, null, null, null, null, null, 1, 1
        )
    `);
    const second = await db.query<{ id: string }>(`
      select id
        from public.query_activity_history(
          'hot-topics', null, null, null, null, null, null, 2, 1
        )
    `);
    expect(first.rows[0]).toMatchObject({
      id: "70000000-0000-4000-8000-000000000011",
      old_values: { name: "Also deleted" },
      total_count: 2,
    });
    expect(second.rows[0].id).toBe("70000000-0000-4000-8000-000000000010");
  });

  it("rejects invalid and excessive filter bounds", async () => {
    await expect(db.query(`
      select * from public.query_activity_history(
        'hot-topics', null, null, 'drop table', null, null, null, 1, 25
      )
    `)).rejects.toThrow(/invalid action/i);
    await expect(db.query(`
      select * from public.query_activity_history(
        'hot-topics', null, null, null, null, null, null, 1, 101
      )
    `)).rejects.toThrow(/page size/i);
    await expect(db.query(`
      select * from public.query_activity_history(
        'hot-topics', statement_timestamp() + interval '1 millisecond',
        null, null, null, null, null, 1, 25
      )
    `)).rejects.toThrow(/snapshot/i);
  });

  it("anchors pagination against inserts between page fetches", async () => {
    await db.exec(`
      delete from public.activity_history;
      insert into public.activity_history
        (id, workspace_id, workspace_slug, workspace_name, action, entity_type, created_at)
      values
        ('70000000-0000-4000-8000-000000000020', '${workspaceA}',
         'hot-topics', 'Hot Topics', 'update', 'status', '2026-07-15T10:00:00Z'),
        ('70000000-0000-4000-8000-000000000021', '${workspaceA}',
         'hot-topics', 'Hot Topics', 'update', 'status', '2026-07-15T09:00:00Z');
    `);
    const first = await db.query<{ id: string; snapshot_at: string }>(`
      select id, snapshot_at
        from public.query_activity_history(
          'hot-topics', '2026-07-15T10:30:00Z', null, null, null, null, null, 1, 1
        )
    `);
    await db.exec(`
      insert into public.activity_history
        (id, workspace_id, workspace_slug, workspace_name, action, entity_type, created_at)
      values ('70000000-0000-4000-8000-000000000022', '${workspaceA}',
              'hot-topics', 'Hot Topics', 'insert', 'status', '2026-07-15T11:00:00Z');
    `);
    const second = await db.query<{ id: string }>(`
      select id
        from public.query_activity_history(
          'hot-topics', '${new Date(first.rows[0].snapshot_at).toISOString()}',
          null, null, null, null, null, 2, 1
        )
    `);
    expect(first.rows[0].id).toBe("70000000-0000-4000-8000-000000000020");
    expect(second.rows[0].id).toBe("70000000-0000-4000-8000-000000000021");
  });

  it("backfills persisted identity from pre-migration workspace audit values", async () => {
    await db.exec(`
      insert into public.activity_history (
        id, workspace_id, action, entity_type, entity_id, old_values, created_at
      )
      values (
        '70000000-0000-4000-8000-000000000030',
        '81000000-0000-4000-8000-000000000030',
        'delete',
        'workspace',
        '81000000-0000-4000-8000-000000000030',
        '{"slug":"pre-migration-deleted","name":"Pre-migration Deleted"}',
        now() - interval '1 hour'
      );
    `);
    await db.exec(migration);
    const rows = await db.query<{ workspace_name: string }>(`
      select workspace_name
        from public.query_activity_history(
          'pre-migration-deleted', null, null, null, null, null, null, 1, 25
        )
    `);
    expect(rows.rows).toEqual([{ workspace_name: "Pre-migration Deleted" }]);
  });

  it("retains workspace identity and history after workspace deletion", async () => {
    await db.exec(`
      delete from public.workspaces where id = '${workspaceB}';
    `);
    const rows = await db.query<{
      action: string;
      workspace_name: string;
      workspace_slug: string;
    }>(`
      select action, workspace_name, workspace_slug
        from public.query_activity_history(
          'platform-development', null, null, 'delete', 'workspace', null, null, 1, 25
        )
    `);
    expect(rows.rows).toContainEqual({
      action: "delete",
      workspace_name: "Platform Development",
      workspace_slug: "platform-development",
    });
    const actors = await db.query<{ actor_id: string; display_name: string }>(`
      select actor_id, display_name
        from public.list_history_actors('platform-development')
    `);
    expect(actors.rows).toContainEqual({
      actor_id: adminId,
      display_name: "History Admin",
    });
  });

  it("resolves a dynamic deleted workspace and permanently reserves its slug", async () => {
    const firstId = "81000000-0000-4000-8000-000000000040";
    const secondId = "81000000-0000-4000-8000-000000000041";
    await db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('${firstId}', 'dynamic-deleted', 'Dynamic Workspace', 400);
      update public.workspaces
         set name = 'Dynamic Workspace Renamed'
       where id = '${firstId}';
    `);
    await expect(db.exec(`
      update public.workspaces
         set slug = 'dynamic-renamed'
       where id = '${firstId}';
    `)).rejects.toThrow(/slug.*cannot be changed/i);
    await db.exec(`delete from public.workspaces where id = '${firstId}';`);
    await expect(db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('${secondId}', 'dynamic-deleted', 'Wrong Generation', 401);
    `)).rejects.toThrow(/reserved|unique/i);

    const identity = await db.query<{
      is_deleted: boolean;
      name: string;
      slug: string;
      workspace_id: string;
    }>(`select * from public.resolve_history_workspace('dynamic-deleted')`);
    expect(identity.rows).toEqual([{
      is_deleted: true,
      name: "Dynamic Workspace Renamed",
      slug: "dynamic-deleted",
      workspace_id: firstId,
    }]);

    await db.exec(`
      insert into public.activity_history (
        workspace_id, workspace_slug, workspace_name, action, entity_type
      )
      values (
        '${secondId}', 'dynamic-deleted', 'Wrong Generation', 'insert', 'workspace'
      );
    `);
    const rows = await db.query<{ workspace_id: string }>(`
      select distinct workspace_id
        from public.query_activity_history(
          'dynamic-deleted', null, null, null, null, null, null, 1, 100
        )
    `);
    expect(rows.rows).toEqual([{ workspace_id: firstId }]);
  });
});

describe("legacy admin metadata hardening", () => {
  it("normalizes colliding oversized admins and marks actor RPC boundaries", async () => {
    const legacy = new PGlite();
    const secondAdminId = "90000000-0000-4000-8000-000000000009";
    const blankAdminId = "90000000-0000-4000-8000-000000000007";
    const whitespaceAdminId = "90000000-0000-4000-8000-000000000006";
    try {
      await legacy.exec(`
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
      await legacy.exec(read("supabase/migrations/0001_core_schema.sql"));
      await legacy.exec(read("supabase/migrations/0002_security_audit_realtime.sql"));
      await legacy.exec(read("supabase/migrations/0003_status_reorder.sql"));
      await legacy.exec(read("supabase/seed.sql"));
      await legacy.exec(migration);
      await legacy.exec(`
        insert into auth.users (id) values
          ('${adminId}'), ('${secondAdminId}'), ('${blankAdminId}'), ('${whitespaceAdminId}');
        insert into public.admin_users (auth_user_id, email, display_name)
        values
          ('${adminId}', repeat('e', 399) || 'a', repeat('d', 250)),
          ('${secondAdminId}', repeat('e', 399) || 'b', repeat('d', 250)),
          ('${blankAdminId}', '', ''),
          ('${whitespaceAdminId}', '   ', E' \t ');
        insert into public.activity_history
          (actor_id, actor_name, workspace_id, workspace_slug, workspace_name,
           action, entity_type)
        values
          ('${adminId}', repeat('s', 250), '${workspaceA}', 'hot-topics',
           'Hot Topics', 'update', 'work_item'),
          ('${secondAdminId}', repeat('t', 250), '${workspaceA}', 'hot-topics',
           'Hot Topics', 'update', 'work_item'),
          ('${blankAdminId}', '', '${workspaceA}', 'hot-topics',
           'Hot Topics', 'update', 'work_item'),
          ('${whitespaceAdminId}', E' \t ', '${workspaceA}', 'hot-topics',
           'Hot Topics', 'update', 'work_item');
        select set_config('request.jwt.claim.sub', '${adminId}', false);
      `);

      await expect(legacy.exec(hardening)).resolves.toBeDefined();
      await expect(legacy.exec(hardening)).resolves.toBeDefined();

      const admins = await legacy.query<{
        auth_user_id: string;
        display_name: string;
        email: string;
      }>(`
        select auth_user_id, display_name, email
          from public.admin_users
         order by auth_user_id
      `);
      expect(admins.rows).toHaveLength(4);
      const oversizedAdmins = admins.rows.filter((admin) =>
        admin.auth_user_id === adminId || admin.auth_user_id === secondAdminId);
      for (const admin of oversizedAdmins) {
        expect(admin.display_name).toMatch(/oversized value truncated/i);
        expect(admin.display_name.length).toBeLessThanOrEqual(200);
        expect(admin.email).toMatch(/oversized value truncated/i);
        expect(admin.email.length).toBeLessThanOrEqual(320);
      }
      const blankAdmins = admins.rows.filter((admin) =>
        admin.auth_user_id === blankAdminId || admin.auth_user_id === whitespaceAdminId);
      expect(blankAdmins.map((admin) => admin.display_name)).toEqual(["Admin", "Admin"]);
      expect(blankAdmins.every((admin) =>
        admin.email.includes(admin.auth_user_id)
        && admin.email.trim().length > 0)).toBe(true);
      expect(new Set(admins.rows.map((row) => row.email)).size).toBe(4);
      const constraints = await legacy.query<{
        conname: string;
        convalidated: boolean;
      }>(`
        select conname, convalidated
          from pg_constraint
         where conrelid = 'public.admin_users'::regclass
           and conname in (
             'admin_users_display_name_length',
             'admin_users_email_length'
           )
         order by conname
      `);
      expect(constraints.rows).toEqual([
        { conname: "admin_users_display_name_length", convalidated: true },
        { conname: "admin_users_email_length", convalidated: true },
      ]);
      await expectSqlError(legacy, `
        insert into auth.users (id)
        values ('90000000-0000-4000-8000-000000000008');
        insert into public.admin_users (auth_user_id, email, display_name)
        values (
          '90000000-0000-4000-8000-000000000008',
          repeat('x', 321),
          repeat('y', 201)
        )
      `, /admin_users_(email|display_name)_length/i);
      await expectSqlError(legacy, `
        insert into auth.users (id)
        values ('90000000-0000-4000-8000-000000000005');
        insert into public.admin_users (auth_user_id, email, display_name)
        values (
          '90000000-0000-4000-8000-000000000005',
          '   ',
          E' \t '
        )
      `, /admin_users_(email|display_name)_length/i);

      const rows = await legacy.query<{
        actor_display_name: string;
        actor_email: string;
        actor_name: string | null;
      }>(`
        select actor_display_name, actor_email, actor_name
          from public.query_activity_history(
            'hot-topics', null, null, null, null, null, null, 1, 25
          )
         where actor_id is not null
      `);
      expect(rows.rows).toHaveLength(4);
      for (const row of rows.rows.filter((row) => row.actor_name !== null)) {
        expect(row.actor_name).toMatch(/oversized value truncated/i);
        expect(row.actor_display_name).toMatch(/oversized value truncated/i);
        expect(row.actor_email).toMatch(/oversized value truncated/i);
      }
      expect(rows.rows.filter((row) => row.actor_name === null)).toHaveLength(2);
      expect(rows.rows.every((row) =>
        row.actor_display_name.trim().length > 0
        && row.actor_email.trim().length > 0)).toBe(true);

      const actors = await legacy.query<{
        display_name: string;
        email: string;
      }>(`select display_name, email from public.list_history_actors('hot-topics')`);
      expect(actors.rows).toHaveLength(4);
      expect(actors.rows.every((row) =>
        row.display_name.trim().length > 0
        && row.email.trim().length > 0)).toBe(true);
    } finally {
      await legacy.close();
    }
  });
});
