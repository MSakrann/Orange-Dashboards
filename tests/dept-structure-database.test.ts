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

  it("seeds five teams and three highlighted projects", async () => {
    const teams = await db.query<{ count: number }>(
      `select count(*)::int as count from public.dept_teams`,
    );
    expect(teams.rows[0]?.count).toBe(5);

    const highlights = await db.query<{ count: number }>(
      `select count(*)::int as count from public.dept_projects where is_highlighted = true`,
    );
    expect(highlights.rows[0]?.count).toBe(3);

    const profile = await db.query<{ brand_name: string }>(
      `select brand_name from public.dept_profile limit 1`,
    );
    expect(profile.rows[0]?.brand_name).toBe("Orange Egypt");
  });

  it("rejects a sixth team and a fourth highlight", async () => {
    await expectSqlError(
      db,
      `insert into public.dept_teams (name, sort_order) values ('Overflow Team', 99)`,
      /Maximum of 5 teams/i,
    );

    await expectSqlError(
      db,
      `insert into public.dept_projects (title, is_highlighted, sort_order)
       values ('Fourth Highlight', true, 99)`,
      /Maximum of 3 highlighted/i,
    );
  });
});
