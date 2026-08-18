// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

async function expectSqlError(db: PGlite, sql: string, message?: RegExp) {
  await db.exec("savepoint expected_error");
  let error: unknown;
  try {
    await db.exec(sql);
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint expected_error");
  await db.exec("release savepoint expected_error");

  expect(error).toBeDefined();
  if (message) {
    expect(String(error)).toMatch(message);
  }
}

describe("dept structure database", () => {
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
    await db.exec(read("supabase/migrations/0009_dept_structure.sql"));
    await db.exec(read("supabase/migrations/0010_dept_structure_team_updates.sql"));
    await db.exec(read("supabase/migrations/0011_dept_team_project_count.sql"));
    await db.exec(read("supabase/migrations/0012_dept_optional_counts.sql"));
  });

  beforeEach(async () => {
    await db.exec("begin");
  });

  afterEach(async () => {
    await db.exec("rollback");
  });

  afterAll(async () => {
    await db.close();
  });

  it("seeds five teams and stores activity summary", async () => {
    const teams = await db.query<{ count: number }>(`select count(*)::int as count from public.dept_teams`);
    expect(teams.rows[0]?.count).toBe(5);

    const sample = await db.query<{ activity_summary: string }>(
      `select activity_summary from public.dept_teams order by sort_order limit 1`,
    );
    expect(sample.rows[0]?.activity_summary).toContain("active");

    const projectCount = await db.query<{ project_count: number | null }>(
      `select project_count from public.dept_teams order by sort_order limit 1`,
    );
    expect(projectCount.rows[0]?.project_count).toBeNull();
  });

  it("allows empty glance and project counts", async () => {
    await db.exec(`
      update public.dept_profile
         set stat_teams = null, stat_members = null, stat_active_projects = null
       where singleton_key = true
    `);
    const profile = await db.query<{
      stat_teams: number | null;
      stat_members: number | null;
      stat_active_projects: number | null;
    }>(`select stat_teams, stat_members, stat_active_projects from public.dept_profile limit 1`);
    expect(profile.rows[0]?.stat_teams).toBeNull();
    expect(profile.rows[0]?.stat_members).toBeNull();
    expect(profile.rows[0]?.stat_active_projects).toBeNull();

    await db.exec(`
      insert into public.dept_teams (name, sort_order, activity_summary, project_count)
      values ('Architecture', 5, '6 active', null)
    `);
    const inserted = await db.query<{ project_count: number | null }>(
      `select project_count from public.dept_teams where name = 'Architecture'`,
    );
    expect(inserted.rows[0]?.project_count).toBeNull();
  });

  it("allows a sixth team and rejects a seventh", async () => {
    await db.exec(`insert into public.dept_teams (name, sort_order, activity_summary) values ('Architecture', 5, '6 active')`);

    const teams = await db.query<{ count: number }>(`select count(*)::int as count from public.dept_teams`);
    expect(teams.rows[0]?.count).toBe(6);

    await expectSqlError(
      db,
      `insert into public.dept_teams (name, sort_order, activity_summary) values ('Overflow Team', 6, '1 active')`,
      /Maximum of 6 teams/i,
    );
  });
});
