// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readIfPresent = (path: string) =>
  existsSync(resolve(root, path)) ? read(path) : "";

const coreMigration = read("supabase/migrations/0001_core_schema.sql");
const securityMigration = readIfPresent(
  "supabase/migrations/0002_security_audit_realtime.sql",
);
const seed = read("supabase/seed.sql");

const ADMIN_ID = "50000000-0000-4000-8000-000000000001";
const USER_ID = "50000000-0000-4000-8000-000000000002";
const HOT_ID = "10000000-0000-4000-8000-000000000001";
const PLATFORM_ID = "10000000-0000-4000-8000-000000000002";
const HOT_ACTIVE_ID = "20000000-0000-4000-8000-000000000001";
const HOT_RISK_ID = "20000000-0000-4000-8000-000000000002";
const PLATFORM_ACTIVE_ID = "20000000-0000-4000-8000-000000000005";
const PROJECT_ID = "30000000-0000-4000-8000-000000000001";

async function bootstrapSupabasePrimitives(db: PGlite) {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = ''
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
}

async function setIdentity(db: PGlite, role: "anon" | "authenticated", id?: string) {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${id ?? ""}', true); set local role ${role};`,
  );
}

async function resetIdentity(db: PGlite) {
  await db.exec("reset role");
}

async function expectRoleError(
  db: PGlite,
  role: "anon" | "authenticated",
  sql: string,
  id?: string,
  message?: RegExp,
) {
  await db.exec("savepoint expected_role_error");
  await setIdentity(db, role, id);
  let error: unknown;
  try {
    await db.exec(sql);
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint expected_role_error");
  await resetIdentity(db);
  await db.exec("release savepoint expected_role_error");

  expect(error).toBeDefined();
  if (message) expect(String(error)).toMatch(message);
}

describe("Supabase security, audit, RPC, and realtime behavior", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await bootstrapSupabasePrimitives(db);
    await db.exec(coreMigration);
    await db.exec(securityMigration);
    await db.exec(seed);
  });

  beforeEach(async () => {
    await db.exec("begin");
    await db.exec(`
      insert into auth.users (id) values ('${ADMIN_ID}'), ('${USER_ID}');
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('${ADMIN_ID}', 'admin@example.com', 'Test Admin');
      delete from public.activity_history;
    `);
  });

  afterEach(async () => {
    await db.exec("rollback");
  });

  afterAll(async () => {
    await db.close();
  });

  it("enables RLS on every application table", async () => {
    const result = await db.query<{ relname: string }>(`
      select relname
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relkind = 'r'
        and relrowsecurity
      order by relname
    `);
    expect(result.rows.map((row) => row.relname)).toEqual([
      "activity_history",
      "admin_users",
      "comments",
      "statuses",
      "work_items",
      "workspaces",
    ]);
  });

  it("reapplies the security migration without weakening security objects", async () => {
    const reapplied = new PGlite();
    try {
      await bootstrapSupabasePrimitives(reapplied);
      await reapplied.exec(coreMigration);
      await reapplied.exec(securityMigration);
      await reapplied.exec(seed);
      await reapplied.exec(securityMigration);

      const objects = await reapplied.query<{
        rls_tables: number;
        audit_triggers: number;
        membership_triggers: number;
        realtime_tables: number;
      }>(`
        select
          (select count(*)::int from pg_class
            where relnamespace = 'public'::regnamespace and relrowsecurity) as rls_tables,
          (select count(*)::int from pg_trigger
            where tgname = 'audit_dashboard_mutation') as audit_triggers,
          (select count(*)::int from pg_trigger
            where tgname = 'lock_work_item_root_membership'
              and tgrelid = 'public.work_items'::regclass) as membership_triggers,
          (select count(*)::int from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename in ('workspaces', 'statuses', 'work_items', 'comments')) as realtime_tables
      `);
      expect(objects.rows[0]).toEqual({
        rls_tables: 6,
        audit_triggers: 4,
        membership_triggers: 1,
        realtime_tables: 4,
      });

      await reapplied.exec(`
        insert into auth.users (id) values ('${ADMIN_ID}'), ('${USER_ID}');
        insert into public.admin_users (auth_user_id, email, display_name)
        values ('${ADMIN_ID}', 'reapply-admin@example.com', 'Reapply Admin');
        delete from public.activity_history;
        begin;
      `);
      await setIdentity(reapplied, "anon");
      const publicRows = await reapplied.query<{ count: number }>(
        "select count(*)::int as count from public.workspaces",
      );
      await resetIdentity(reapplied);
      await setIdentity(reapplied, "authenticated", USER_ID);
      const blocked = await reapplied.query<{ id: string }>(`
        update public.work_items set title = 'blocked'
        where id = '${PROJECT_ID}' returning id
      `);
      await resetIdentity(reapplied);
      await setIdentity(reapplied, "authenticated", ADMIN_ID);
      await reapplied.exec(`
        update public.work_items set title = 'reapplied'
        where id = '${PROJECT_ID}'
      `);
      const audited = await reapplied.query<{ count: number }>(`
        select count(*)::int as count from public.activity_history
        where actor_id = '${ADMIN_ID}' and entity_id = '${PROJECT_ID}'
      `);
      await resetIdentity(reapplied);
      await reapplied.exec("rollback");

      expect(publicRows.rows[0].count).toBeGreaterThan(0);
      expect(blocked.rows).toHaveLength(0);
      expect(audited.rows[0].count).toBe(1);
    } finally {
      await reapplied.close();
    }
  });

  it("pins every security-definer entry point to an empty search path", async () => {
    const functions = await db.query<{ proname: string; secure_path: boolean }>(`
      select proname,
             'search_path=""' = any(coalesce(proconfig, array[]::text[])) as secure_path
      from pg_proc
      where oid in (
        'public.is_admin()'::regprocedure,
        'public.audit_dashboard_mutation()'::regprocedure,
        'public.delete_work_item_comments_for_audit()'::regprocedure,
        'public.lock_work_item_root_membership()'::regprocedure,
        'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure,
        'public.replace_and_delete_status(uuid,uuid,uuid)'::regprocedure
      )
      order by proname
    `);
    expect(functions.rows).toHaveLength(6);
    expect(functions.rows.every((row) => row.secure_path)).toBe(true);
  });

  it.each(["anon", "authenticated"] as const)(
    "allows %s to read public dashboard tables",
    async (role) => {
      await setIdentity(db, role, role === "authenticated" ? USER_ID : undefined);
      const counts = await db.query<{
        workspaces: number;
        statuses: number;
        work_items: number;
        comments: number;
      }>(`
        select
          (select count(*)::int from public.workspaces) as workspaces,
          (select count(*)::int from public.statuses) as statuses,
          (select count(*)::int from public.work_items) as work_items,
          (select count(*)::int from public.comments) as comments
      `);
      await resetIdentity(db);
      expect(counts.rows[0]).toEqual({
        workspaces: 3,
        statuses: 12,
        work_items: 13,
        comments: 2,
      });
    },
  );

  it("rejects anonymous and authenticated non-admin dashboard writes", async () => {
    await expectRoleError(
      db,
      "anon",
      `insert into public.workspaces (slug, name, sort_order) values ('anon', 'Anon', 20)`,
    );
    await setIdentity(db, "authenticated", USER_ID);
    const updated = await db.query<{ id: string }>(`
      update public.work_items
      set title = 'tampered'
      where id = '${PROJECT_ID}'
      returning id
    `);
    const deleted = await db.query<{ id: string }>(
      "delete from public.comments returning id",
    );
    await resetIdentity(db);

    expect(updated.rows).toHaveLength(0);
    expect(deleted.rows).toHaveLength(0);
  });

  it("enforces grants and RLS across the complete client table matrix", async () => {
    const dashboardTables = ["workspaces", "statuses", "work_items", "comments"];

    for (const role of ["anon", "authenticated"] as const) {
      await setIdentity(db, role, role === "authenticated" ? USER_ID : undefined);
      for (const table of dashboardTables) {
        const rows = await db.query<{ count: number }>(
          `select count(*)::int as count from public.${table}`,
        );
        expect(rows.rows[0].count).toBeGreaterThan(0);
      }
      await resetIdentity(db);
    }

    for (const table of dashboardTables) {
      await expectRoleError(
        db,
        "anon",
        `insert into public.${table} default values`,
        undefined,
        /permission denied/i,
      );
      await expectRoleError(
        db,
        "anon",
        `update public.${table} set updated_at = now()`,
        undefined,
        /permission denied/i,
      );
      await expectRoleError(
        db,
        "anon",
        `delete from public.${table}`,
        undefined,
        /permission denied/i,
      );
      await expectRoleError(
        db,
        "authenticated",
        `insert into public.${table} default values`,
        USER_ID,
        /row-level security|permission denied/i,
      );
    }

    await setIdentity(db, "authenticated", USER_ID);
    for (const table of dashboardTables) {
      const updated = await db.query<{ count: number }>(
        `with changed as (update public.${table} set updated_at = now() returning 1)
         select count(*)::int as count from changed`,
      );
      const deleted = await db.query<{ count: number }>(
        `with removed as (delete from public.${table} returning 1)
         select count(*)::int as count from removed`,
      );
      expect(updated.rows[0].count).toBe(0);
      expect(deleted.rows[0].count).toBe(0);
    }
    await resetIdentity(db);

    for (const table of ["admin_users", "activity_history"]) {
      await expectRoleError(
        db,
        "anon",
        `select * from public.${table}`,
        undefined,
        /permission denied/i,
      );
    }
  });

  it("uses a recursion-safe predicate and allows admin dashboard writes", async () => {
    await setIdentity(db, "authenticated", USER_ID);
    const nonAdmin = await db.query<{ is_admin: boolean }>(
      "select public.is_admin() as is_admin",
    );
    await resetIdentity(db);

    await setIdentity(db, "authenticated", ADMIN_ID);
    const admin = await db.query<{ is_admin: boolean }>(
      "select public.is_admin() as is_admin",
    );
    const inserted = await db.query<{ id: string }>(`
      insert into public.comments (work_item_id, author_name, body)
      values ('${PROJECT_ID}', 'Admin', 'Allowed')
      returning id
    `);
    await db.exec(
      `update public.comments set body = 'Updated' where id = '${inserted.rows[0].id}'`,
    );
    await db.exec(`delete from public.comments where id = '${inserted.rows[0].id}'`);
    await resetIdentity(db);

    expect(nonAdmin.rows[0].is_admin).toBe(false);
    expect(admin.rows[0].is_admin).toBe(true);
  });

  it("allows an admin to insert, update, and delete every dashboard entity", async () => {
    const workspaceId = "80000000-0000-4000-8000-000000000001";
    const statusId = "80000000-0000-4000-8000-000000000002";
    const itemId = "80000000-0000-4000-8000-000000000003";
    const commentId = "80000000-0000-4000-8000-000000000004";

    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('${workspaceId}', 'matrix-admin', 'Matrix Admin', 30);
      insert into public.statuses
        (id, workspace_id, name, color, sort_order, reporting_category)
      values ('${statusId}', '${workspaceId}', 'Open', '#000000', 0, 'active');
      insert into public.work_items
        (id, workspace_id, title, status_id, sort_order)
      values ('${itemId}', '${workspaceId}', 'Matrix item', '${statusId}', 0);
      insert into public.comments (id, work_item_id, author_name, body)
      values ('${commentId}', '${itemId}', 'Admin', 'Matrix comment');
      update public.workspaces set description = 'updated' where id = '${workspaceId}';
      update public.statuses set color = '#111111' where id = '${statusId}';
      update public.work_items set title = 'updated' where id = '${itemId}';
      update public.comments set body = 'updated' where id = '${commentId}';
      delete from public.comments where id = '${commentId}';
      delete from public.work_items where id = '${itemId}';
      delete from public.statuses where id = '${statusId}';
      delete from public.workspaces where id = '${workspaceId}';
    `);
    await resetIdentity(db);

    const remaining = await db.query<{ count: number }>(`
      select count(*)::int as count from public.workspaces where id = '${workspaceId}'
    `);
    expect(remaining.rows[0].count).toBe(0);
  });

  it("keeps admin users private while service role can manage them manually", async () => {
    await expectRoleError(
      db,
      "authenticated",
      "select * from public.admin_users",
      ADMIN_ID,
      /permission denied/i,
    );

    await db.exec("set local role service_role");
    const visible = await db.query<{ count: number }>(
      "select count(*)::int as count from public.admin_users",
    );
    await db.exec(`
      update public.admin_users
      set display_name = 'Managed by service role'
      where auth_user_id = '${ADMIN_ID}'
    `);
    await resetIdentity(db);
    expect(visible.rows[0].count).toBe(1);
  });

  it("keeps history admin-only and denies every direct client mutation", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(
      `update public.work_items set title = 'Audited title' where id = '${PROJECT_ID}'`,
    );
    const adminHistory = await db.query<{ count: number }>(
      "select count(*)::int as count from public.activity_history",
    );
    await resetIdentity(db);
    expect(adminHistory.rows[0].count).toBe(1);

    await setIdentity(db, "authenticated", USER_ID);
    const privateHistory = await db.query<{ count: number }>(
      "select count(*)::int as count from public.activity_history",
    );
    await resetIdentity(db);
    expect(privateHistory.rows[0].count).toBe(0);

    for (const statement of [
      `insert into public.activity_history (action, entity_type) values ('fake', 'work_item')`,
      `update public.activity_history set action = 'fake'`,
      `delete from public.activity_history`,
    ]) {
      await expectRoleError(db, "authenticated", statement, ADMIN_ID);
    }
  });

  it("creates mutation audit triggers with actor, workspace, and old/new values", async () => {
    const triggers = await db.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'audit_dashboard_mutation'
      order by c.relname
    `);
    expect(triggers.rows.map((row) => row.table_name)).toEqual([
      "comments",
      "statuses",
      "work_items",
      "workspaces",
    ]);

    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(
      `update public.work_items set title = 'New title' where id = '${PROJECT_ID}'`,
    );
    const history = await db.query<{
      actor_id: string;
      actor_name: string;
      workspace_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      old_title: string;
      new_title: string;
      created_at: Date;
    }>(`
      select actor_id, actor_name, workspace_id, action, entity_type, entity_id,
             old_values ->> 'title' as old_title,
             new_values ->> 'title' as new_title,
             created_at
      from public.activity_history
      where entity_id = '${PROJECT_ID}'
    `);
    await resetIdentity(db);

    expect(history.rows[0]).toMatchObject({
      actor_id: ADMIN_ID,
      actor_name: "Test Admin",
      workspace_id: HOT_ID,
      action: "update",
      entity_type: "work_item",
      entity_id: PROJECT_ID,
      old_title: "Operations Team Open Tickets",
      new_title: "New title",
    });
    expect(history.rows[0].created_at).toBeTruthy();
  });

  it("preserves audit history after source deletion", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    const comment = await db.query<{ id: string }>(`
      insert into public.comments (work_item_id, author_name, body)
      values ('${PROJECT_ID}', 'Admin', 'Delete me')
      returning id
    `);
    await db.exec(`delete from public.comments where id = '${comment.rows[0].id}'`);
    const history = await db.query<{ action: string; new_values: unknown }>(`
      select action, new_values
      from public.activity_history
      where entity_id = '${comment.rows[0].id}'
      order by created_at desc, id desc
    `);
    await resetIdentity(db);

    expect(history.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["insert", "delete"]),
    );
    expect(history.rows.find((row) => row.action === "delete")?.new_values).toBeNull();
  });

  it("retains workspace context when deleting a work item cascades to comments", async () => {
    const commentId = "40000000-0000-4000-8000-000000000001";
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`delete from public.work_items where id = '${PROJECT_ID}'`);
    const commentAudit = await db.query<{
      workspace_id: string;
      action: string;
      old_work_item_id: string;
    }>(`
      select workspace_id, action, old_values ->> 'work_item_id' as old_work_item_id
      from public.activity_history
      where entity_type = 'comment' and entity_id = '${commentId}'
    `);
    await resetIdentity(db);

    expect(commentAudit.rows).toEqual([
      {
        workspace_id: HOT_ID,
        action: "delete",
        old_work_item_id: PROJECT_ID,
      },
    ]);
  });

  it("preserves complete audit context through workspace and status cascades", async () => {
    const workspaceId = "81000000-0000-4000-8000-000000000001";
    const statusId = "81000000-0000-4000-8000-000000000002";
    const itemId = "81000000-0000-4000-8000-000000000003";
    const commentId = "81000000-0000-4000-8000-000000000004";
    await db.exec("delete from public.activity_history");
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      insert into public.workspaces (id, slug, name, sort_order)
      values ('${workspaceId}', 'cascade-audit', 'Cascade Audit', 31);
      insert into public.statuses
        (id, workspace_id, name, color, sort_order, reporting_category)
      values ('${statusId}', '${workspaceId}', 'Open', '#000000', 0, 'active');
      insert into public.work_items
        (id, workspace_id, title, status_id, sort_order)
      values ('${itemId}', '${workspaceId}', 'Cascade item', '${statusId}', 0);
      insert into public.comments (id, work_item_id, author_name, body)
      values ('${commentId}', '${itemId}', 'Admin', 'Cascade comment');
    `);
    await db.exec(`delete from public.workspaces where id = '${workspaceId}'`);
    const history = await db.query<{
      entity_type: string;
      entity_id: string;
      workspace_id: string;
      action: string;
      old_values: unknown;
    }>(`
      select entity_type, entity_id, workspace_id, action, old_values
      from public.activity_history
      where workspace_id = '${workspaceId}' and action = 'delete'
    `);
    await resetIdentity(db);

    expect(history.rows.map((row) => [row.entity_type, row.entity_id])).toEqual(
      expect.arrayContaining([
        ["workspace", workspaceId],
        ["status", statusId],
        ["work_item", itemId],
        ["comment", commentId],
      ]),
    );
    expect(history.rows).toHaveLength(4);
    expect(history.rows.every((row) => row.old_values !== null)).toBe(true);
  });

  it("reorders an exact sibling set atomically and records normal audits", async () => {
    await db.exec("delete from public.activity_history");
    await setIdentity(db, "authenticated", ADMIN_ID);
    const first = "60000000-0000-4000-8000-000000000001";
    const second = "60000000-0000-4000-8000-000000000002";
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values
        ('${first}', '${HOT_ID}', '${PROJECT_ID}', 'First', '${HOT_ACTIVE_ID}', 0),
        ('${second}', '${HOT_ID}', '${PROJECT_ID}', 'Second', '${HOT_ACTIVE_ID}', 1)
    `);
    await db.exec(`
      select public.reorder_work_items(
        '${HOT_ID}', '${PROJECT_ID}', array['${second}'::uuid, '${first}'::uuid]
      )
    `);
    const order = await db.query<{ id: string; sort_order: number }>(`
      select id, sort_order
      from public.work_items
      where parent_id = '${PROJECT_ID}'
      order by sort_order
    `);
    const audits = await db.query<{ count: number }>(`
      select count(*)::int as count
      from public.activity_history
      where entity_type = 'work_item' and action = 'update'
    `);
    await resetIdentity(db);

    expect(order.rows).toEqual([
      { id: second, sort_order: 0 },
      { id: first, sort_order: 1 },
    ]);
    expect(audits.rows[0].count).toBeGreaterThanOrEqual(2);
  });

  it("takes a stable workspace lock before root sibling reordering", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      select public.reorder_work_items(
        '${HOT_ID}',
        null,
        (
          select array_agg(id order by sort_order)
          from public.work_items
          where workspace_id = '${HOT_ID}' and parent_id is null
        )
      )
    `);
    const locks = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_locks
      where pid = pg_backend_pid()
        and relation = 'public.workspaces'::regclass
        and mode = 'RowShareLock'
        and granted
    `);
    await resetIdentity(db);
    expect(locks.rows[0].count).toBeGreaterThan(0);
  });

  it("locks exact workspace tuples for every root-membership mutation", async () => {
    const contract = await db.query<{
      trigger_definition: string;
      function_definition: string;
      reorder_definition: string;
    }>(`
      select
        pg_get_triggerdef(t.oid) as trigger_definition,
        membership.prosrc as function_definition,
        reorder.prosrc as reorder_definition
      from pg_trigger t
      join pg_proc membership on membership.oid = t.tgfoid
      cross join pg_proc reorder
      where t.tgrelid = 'public.work_items'::regclass
        and t.tgname = 'lock_work_item_root_membership'
        and not t.tgisinternal
        and reorder.oid = 'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure
    `);

    expect(contract.rows).toHaveLength(1);
    const triggerDefinition = contract.rows[0].trigger_definition.toLowerCase();
    const functionDefinition = contract.rows[0].function_definition
      .replace(/\s+/g, " ")
      .toLowerCase();
    const reorderDefinition = contract.rows[0].reorder_definition
      .replace(/\s+/g, " ")
      .toLowerCase();

    expect(triggerDefinition).toContain("before insert or delete or update");
    expect(triggerDefinition).toContain("parent_id");
    expect(triggerDefinition).toContain("workspace_id");
    expect(functionDefinition).toMatch(
      /from public\.workspaces.+order by id.+for update/,
    );
    expect(reorderDefinition).toMatch(
      /from public\.work_items.+order by id.+for update/,
    );
    expect(reorderDefinition).toMatch(
      /p_parent_id is not null and id = p_parent_id/,
    );

    const itemLock = reorderDefinition.indexOf("from public.work_items");
    const workspaceLock = reorderDefinition.indexOf("from public.workspaces");
    const postWorkspaceValidation = reorderDefinition.indexOf(
      "select count(*)::integer",
      workspaceLock,
    );
    expect(itemLock).toBeGreaterThanOrEqual(0);
    expect(workspaceLock).toBeGreaterThan(itemLock);
    expect(postWorkspaceValidation).toBeGreaterThan(workspaceLock);
    expect(
      reorderDefinition.match(
        /parent_id is not distinct from p_parent_id/g,
      )?.length,
    ).toBeGreaterThanOrEqual(2);

    const child = "84000000-0000-4000-8000-000000000001";
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values
        ('${child}', '${HOT_ID}', '${PROJECT_ID}', 'Promoted child', '${HOT_ACTIVE_ID}', 0);
      update public.work_items
         set parent_id = null, sort_order = 40
       where id = '${child}';
    `);
    const promoted = await db.query<{ parent_id: string | null }>(`
      select parent_id from public.work_items where id = '${child}'
    `);
    await resetIdentity(db);
    expect(promoted.rows[0].parent_id).toBeNull();
  });

  it("normalizes sort order when an item joins the root sibling set", async () => {
    const child = "85000000-0000-4000-8000-000000000001";
    const insertedRoot = "85000000-0000-4000-8000-000000000002";
    const before = await db.query<{ max_sort_order: number }>(`
      select max(sort_order)::int as max_sort_order
      from public.work_items
      where workspace_id = '${HOT_ID}' and parent_id is null
    `);
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values
        ('${insertedRoot}', '${HOT_ID}', null, 'Normalized root', '${HOT_ACTIVE_ID}', 0);
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values
        ('${child}', '${HOT_ID}', '${PROJECT_ID}', 'Normalized child', '${HOT_ACTIVE_ID}', 0)
    `);

    await db.exec("savepoint promote_with_collision");
    let error: unknown;
    try {
      await db.exec(`
        update public.work_items
           set parent_id = null, sort_order = 0
         where id = '${child}'
      `);
    } catch (caught) {
      error = caught;
      await db.exec("rollback to savepoint promote_with_collision");
    }
    await db.exec("release savepoint promote_with_collision");

    let positions:
      | Array<{ id: string; parent_id: string | null; sort_order: number }>
      | undefined;
    if (!error) {
      const result = await db.query<{
        id: string;
        parent_id: string | null;
        sort_order: number;
      }>(`
        select id, parent_id, sort_order
        from public.work_items
        where id in ('${insertedRoot}', '${child}')
        order by sort_order
      `);
      positions = result.rows;
    }
    await resetIdentity(db);

    expect(error).toBeUndefined();
    expect(positions).toEqual([
      {
        id: insertedRoot,
        parent_id: null,
        sort_order: before.rows[0].max_sort_order + 1,
      },
      {
        id: child,
        parent_id: null,
        sort_order: before.rows[0].max_sort_order + 2,
      },
    ]);
  });

  it("fails sibling tuple contention immediately with retryable semantics", async () => {
    const functionRecord = await db.query<{ definition: string }>(`
      select regexp_replace(prosrc, '\\s+', ' ', 'g') as definition
      from pg_proc
      where oid = 'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure
    `);
    const definition = functionRecord.rows[0].definition.toLowerCase();

    expect(definition).toMatch(/order by id for update nowait/);
    expect(definition).toContain("when lock_not_available");
    expect(definition).toContain("errcode = '55p03'");
    expect(definition).toMatch(/retry.+fresh sibling/i);
    expect(definition).not.toContain("when others");

    const itemNowait = definition.indexOf("order by id for update nowait");
    const workspaceNowait = definition.indexOf(
      "from public.workspaces where id = p_workspace_id for update nowait",
    );
    const retryHandler = definition.indexOf(
      "exception when lock_not_available",
    );
    expect(workspaceNowait).toBeGreaterThan(itemNowait);
    expect(retryHandler).toBeGreaterThan(workspaceNowait);
    expect(definition.match(/when lock_not_available/g)).toHaveLength(1);
  });

  it("validates reorder identity, workspace, parent, duplicates, and completeness", async () => {
    await expectRoleError(
      db,
      "authenticated",
      `select public.reorder_work_items('${HOT_ID}', null, array['${PROJECT_ID}'::uuid])`,
      USER_ID,
      /admin/i,
    );

    await setIdentity(db, "authenticated", ADMIN_ID);
    for (const [sql, message] of [
      [
        `select public.reorder_work_items('${PLATFORM_ID}', null, array['${PROJECT_ID}'::uuid])`,
        /workspace|sibling/i,
      ],
      [
        `select public.reorder_work_items('${HOT_ID}', null, array['${PROJECT_ID}'::uuid, '${PROJECT_ID}'::uuid])`,
        /duplicate/i,
      ],
      [
        `select public.reorder_work_items('${HOT_ID}', null, array[null]::uuid[])`,
        /null/i,
      ],
      [
        `select public.reorder_work_items('${HOT_ID}', null, array['${PROJECT_ID}'::uuid])`,
        /all sibling/i,
      ],
      [
        `select public.reorder_work_items('${HOT_ID}', '${PROJECT_ID}', array['${PROJECT_ID}'::uuid])`,
        /sibling|parent/i,
      ],
    ] as const) {
      await db.exec("savepoint invalid_reorder");
      let error: unknown;
      try {
        await db.exec(sql);
      } catch (caught) {
        error = caught;
      }
      await db.exec("rollback to savepoint invalid_reorder");
      await db.exec("release savepoint invalid_reorder");
      expect(String(error)).toMatch(message);
    }
    await resetIdentity(db);
  });

  it("rolls back every reorder update when one sibling update fails", async () => {
    const first = "82000000-0000-4000-8000-000000000001";
    const second = "82000000-0000-4000-8000-000000000002";
    await db.exec(`
      create function public.reject_second_reorder()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        if new.id = '${second}' and new.sort_order = 0 then
          raise exception 'forced reorder failure';
        end if;
        return new;
      end;
      $$;
      create trigger reject_second_reorder
      before update on public.work_items
      for each row execute function public.reject_second_reorder();
    `);
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values
        ('${first}', '${HOT_ID}', '${PROJECT_ID}', 'First rollback', '${HOT_ACTIVE_ID}', 0),
        ('${second}', '${HOT_ID}', '${PROJECT_ID}', 'Second rollback', '${HOT_ACTIVE_ID}', 1);
    `);
    await db.exec("savepoint reorder_failure");
    let error: unknown;
    try {
      await db.exec(`
        select public.reorder_work_items(
          '${HOT_ID}', '${PROJECT_ID}', array['${second}'::uuid, '${first}'::uuid]
        )
      `);
    } catch (caught) {
      error = caught;
    }
    await db.exec("rollback to savepoint reorder_failure");
    const order = await db.query<{ id: string; sort_order: number }>(`
      select id, sort_order from public.work_items
      where id in ('${first}', '${second}') order by sort_order
    `);
    await resetIdentity(db);

    expect(String(error)).toMatch(/forced reorder failure/i);
    expect(order.rows).toEqual([
      { id: first, sort_order: 0 },
      { id: second, sort_order: 1 },
    ]);
  });

  it("replaces a same-workspace status everywhere before deleting it", async () => {
    await db.exec("delete from public.activity_history");
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(
      `select public.replace_and_delete_status('${HOT_ID}', '${HOT_ACTIVE_ID}', '${HOT_RISK_ID}')`,
    );
    const effects = await db.query<{
      old_statuses: number;
      old_references: number;
      new_references: number;
      status_delete_audits: number;
      item_update_audits: number;
    }>(`
      select
        (select count(*)::int from public.statuses where id = '${HOT_ACTIVE_ID}') as old_statuses,
        (select count(*)::int from public.work_items where status_id = '${HOT_ACTIVE_ID}') as old_references,
        (select count(*)::int from public.work_items where status_id = '${HOT_RISK_ID}') as new_references,
        (select count(*)::int from public.activity_history
          where entity_id = '${HOT_ACTIVE_ID}' and action = 'delete') as status_delete_audits,
        (select count(*)::int from public.activity_history
          where entity_type = 'work_item' and action = 'update') as item_update_audits
    `);
    await resetIdentity(db);

    expect(effects.rows[0]).toEqual({
      old_statuses: 0,
      old_references: 0,
      new_references: 9,
      status_delete_audits: 1,
      item_update_audits: 9,
    });
  });

  it("validates replacement identity, distinct statuses, existence, and workspace", async () => {
    await expectRoleError(
      db,
      "authenticated",
      `select public.replace_and_delete_status('${HOT_ID}', '${HOT_ACTIVE_ID}', '${HOT_RISK_ID}')`,
      USER_ID,
      /admin/i,
    );

    await setIdentity(db, "authenticated", ADMIN_ID);
    for (const [sql, message] of [
      [
        `select public.replace_and_delete_status('${HOT_ID}', '${HOT_ACTIVE_ID}', '${HOT_ACTIVE_ID}')`,
        /different/i,
      ],
      [
        `select public.replace_and_delete_status('${HOT_ID}', '${HOT_ACTIVE_ID}', '${PLATFORM_ACTIVE_ID}')`,
        /workspace/i,
      ],
      [
        `select public.replace_and_delete_status('${HOT_ID}', '70000000-0000-4000-8000-000000000001', '${HOT_RISK_ID}')`,
        /source status/i,
      ],
      [
        `select public.replace_and_delete_status('${HOT_ID}', '${HOT_ACTIVE_ID}', '70000000-0000-4000-8000-000000000002')`,
        /replacement status/i,
      ],
    ] as const) {
      await db.exec("savepoint invalid_replace");
      let error: unknown;
      try {
        await db.exec(sql);
      } catch (caught) {
        error = caught;
      }
      await db.exec("rollback to savepoint invalid_replace");
      await db.exec("release savepoint invalid_replace");
      expect(String(error)).toMatch(message);
    }
    await resetIdentity(db);
  });

  it("deletes an unused source status without changing work items", async () => {
    const unusedStatus = "83000000-0000-4000-8000-000000000001";
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.exec(`
      insert into public.statuses
        (id, workspace_id, name, color, sort_order, reporting_category)
      values ('${unusedStatus}', '${HOT_ID}', 'Unused', '#222222', 20, 'active')
    `);
    const before = await db.query<{ count: number }>(
      "select count(*)::int as count from public.work_items",
    );
    await db.exec(`
      select public.replace_and_delete_status(
        '${HOT_ID}', '${unusedStatus}', '${HOT_RISK_ID}'
      )
    `);
    const after = await db.query<{
      count: number;
      source_exists: number;
      source_delete_audits: number;
    }>(`
      select
        count(*)::int as count,
        (select count(*)::int from public.statuses where id = '${unusedStatus}') as source_exists,
        (
          select count(*)::int
          from public.activity_history
          where entity_id = '${unusedStatus}'
            and workspace_id = '${HOT_ID}'
            and action = 'delete'
            and old_values ->> 'name' = 'Unused'
            and new_values is null
        ) as source_delete_audits
      from public.work_items
    `);
    await resetIdentity(db);

    expect(after.rows[0]).toEqual({
      count: before.rows[0].count,
      source_exists: 0,
      source_delete_audits: 1,
    });
  });

  it("rolls back status reassignment when source deletion is rejected", async () => {
    await db.exec(`
      create table public.status_delete_guard (
        status_id uuid primary key references public.statuses(id) on delete restrict
      );
      insert into public.status_delete_guard (status_id) values ('${HOT_ACTIVE_ID}');
    `);
    await setIdentity(db, "authenticated", ADMIN_ID);
    const before = await db.query<{ count: number }>(`
      select count(*)::int as count from public.work_items where status_id = '${HOT_ACTIVE_ID}'
    `);
    await db.exec("savepoint replacement_failure");
    let error: unknown;
    try {
      await db.exec(
        `select public.replace_and_delete_status('${HOT_ID}', '${HOT_ACTIVE_ID}', '${HOT_RISK_ID}')`,
      );
    } catch (caught) {
      error = caught;
    }
    await db.exec("rollback to savepoint replacement_failure");
    const after = await db.query<{ count: number }>(`
      select count(*)::int as count from public.work_items where status_id = '${HOT_ACTIVE_ID}'
    `);
    await resetIdentity(db);

    expect(error).toBeDefined();
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("keeps one-level hierarchy and status workspace constraints under admin RLS", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    const child = "60000000-0000-4000-8000-000000000003";
    await db.exec(`
      insert into public.work_items
        (id, workspace_id, parent_id, title, status_id, sort_order)
      values ('${child}', '${HOT_ID}', '${PROJECT_ID}', 'Child', '${HOT_ACTIVE_ID}', 0)
    `);
    for (const sql of [
      `insert into public.work_items (workspace_id, parent_id, title, status_id, sort_order)
       values ('${HOT_ID}', '${child}', 'Nested', '${HOT_ACTIVE_ID}', 0)`,
      `insert into public.work_items (workspace_id, title, status_id, sort_order)
       values ('${PLATFORM_ID}', 'Wrong status', '${HOT_ACTIVE_ID}', 20)`,
    ]) {
      await db.exec("savepoint invariant_error");
      let error: unknown;
      try {
        await db.exec(sql);
      } catch (caught) {
        error = caught;
      }
      await db.exec("rollback to savepoint invariant_error");
      await db.exec("release savepoint invariant_error");
      expect(error).toBeDefined();
    }
    await resetIdentity(db);
  });

  it("publishes public dashboard tables with full replica identity", async () => {
    const publication = await db.query<{ tablename: string }>(`
      select tablename
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
      order by tablename
    `);
    const replicaIdentity = await db.query<{ relname: string; relreplident: string }>(`
      select relname, relreplident
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('workspaces', 'statuses', 'work_items', 'comments')
      order by relname
    `);

    expect(publication.rows.map((row) => row.tablename)).toEqual(
      expect.arrayContaining(["comments", "statuses", "work_items", "workspaces"]),
    );
    expect(replicaIdentity.rows.every((row) => row.relreplident === "f")).toBe(true);
  });
});
