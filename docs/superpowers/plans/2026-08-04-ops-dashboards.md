# Operations Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three Jira-mirrored operations workspaces (`pe-operations`, `development-operations`, `datalake-operations`) so the product exposes six dashboards in a fixed order.

**Architecture:** Extend the existing PE/Platform Jira allowlist pattern—no registry refactor. Fixture list + workspace switcher gain three entries; a new Supabase migration inserts workspaces/statuses/Jira settings/mappings; seed stays the deterministic local source for the six workspace rows; env prefixes document credentials outside git.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright, Supabase Postgres migrations/seed, existing `lib/jira/*` sync/webhook code.

**Spec:** `docs/superpowers/specs/2026-08-04-ops-dashboards-design.md`

## Global Constraints

- Never commit Jira API tokens or webhook secrets; only placeholder env docs.
- Workspace order must be: `hot-topics`, `pe-development`, `platform-development`, `pe-operations`, `development-operations`, `datalake-operations`.
- New boards are Jira one-way mirrors (same RLS / status-mapping behavior as PE/Platform).
- JQL for all three new boards: `project = SCRUM ORDER BY updated DESC`.
- Env prefixes: `JIRA_PE_OPS`, `JIRA_DEV_OPS`, `JIRA_DATALAKE_OPS`.
- Reuse migration `0007` Jira→dashboard status mapping pairs for the new workspaces.
- `workspaces.sort_order` is globally unique — reorder via a temporary high value to avoid unique violations.

## File map

| File | Responsibility |
|------|----------------|
| `data/workspaces.ts` | Fixture workspace list (also powers workspace switcher) |
| `lib/jira/types.ts` | `JiraWorkspaceSlug` union |
| `lib/jira/config.ts` | Slug allowlist + env prefix resolution |
| `lib/data/dashboard.ts` | Browse-base-URL resolution for issue links |
| `supabase/migrations/0008_ops_workspaces.sql` | Insert ops workspaces, statuses, jira settings/mappings; fix sort order |
| `supabase/seed.sql` | Deterministic six-workspace local seed + statuses |
| `.env.example` | Document new env var groups (placeholders only) |
| `README.md` | Document six dashboards + webhooks/env |
| `tests/jira-sync.test.ts` | Allowlist unit coverage |
| `e2e/public-fixture.spec.ts` | Switcher navigation for new slugs |

---

### Task 1: Jira slug allowlist + browse URL

**Files:**
- Modify: `lib/jira/types.ts`
- Modify: `lib/jira/config.ts`
- Modify: `lib/data/dashboard.ts` (function `resolveJiraBrowseBaseUrl`)
- Test: `tests/jira-sync.test.ts`

**Interfaces:**
- Consumes: existing `getJiraConnectionForSlug`, `isJiraWorkspaceSlug`, env `${prefix}_*` pattern
- Produces:
  - `JiraWorkspaceSlug` includes `"pe-operations" | "development-operations" | "datalake-operations"`
  - `envPrefixForSlug` / prefix map returns `JIRA_PE_OPS` | `JIRA_DEV_OPS` | `JIRA_DATALAKE_OPS` for those slugs
  - `resolveJiraBrowseBaseUrl` returns stripped `JIRA_*_BASE_URL` for the three new slugs

- [ ] **Step 1: Write the failing test**

In `tests/jira-sync.test.ts`, replace the slug recognition test with:

```ts
it("recognizes Jira-linked workspace slugs", () => {
  expect(isJiraWorkspaceSlug("pe-development")).toBe(true);
  expect(isJiraWorkspaceSlug("platform-development")).toBe(true);
  expect(isJiraWorkspaceSlug("pe-operations")).toBe(true);
  expect(isJiraWorkspaceSlug("development-operations")).toBe(true);
  expect(isJiraWorkspaceSlug("datalake-operations")).toBe(true);
  expect(isJiraWorkspaceSlug("hot-topics")).toBe(false);
});
```

Keep the existing `returns null when workspace env is not configured` test for `pe-development`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jira-sync.test.ts`

Expected: FAIL — `isJiraWorkspaceSlug("pe-operations")` is `false` (and/or the other new slugs).

- [ ] **Step 3: Implement allowlist + prefixes + browse URLs**

`lib/jira/types.ts` — replace the slug type:

```ts
export type JiraWorkspaceSlug =
  | "pe-development"
  | "platform-development"
  | "pe-operations"
  | "development-operations"
  | "datalake-operations";
```

`lib/jira/config.ts` — replace slug list and prefix helper:

```ts
const JIRA_WORKSPACE_SLUGS: JiraWorkspaceSlug[] = [
  "pe-development",
  "platform-development",
  "pe-operations",
  "development-operations",
  "datalake-operations",
];

const JIRA_ENV_PREFIX_BY_SLUG: Record<JiraWorkspaceSlug, string> = {
  "pe-development": "JIRA_PE",
  "platform-development": "JIRA_PLATFORM",
  "pe-operations": "JIRA_PE_OPS",
  "development-operations": "JIRA_DEV_OPS",
  "datalake-operations": "JIRA_DATALAKE_OPS",
};

function envPrefixForSlug(slug: JiraWorkspaceSlug): string {
  return JIRA_ENV_PREFIX_BY_SLUG[slug];
}
```

Leave `getJiraConnectionForSlug`, `listConfiguredJiraWorkspaces`, and `assertCronAuthorized` logic unchanged (they already iterate `JIRA_WORKSPACE_SLUGS` / use `envPrefixForSlug`).

`lib/data/dashboard.ts` — replace `resolveJiraBrowseBaseUrl` with a prefix map (do not require full connection config, only `BASE_URL`):

```ts
function resolveJiraBrowseBaseUrl(workspaceSlug: string) {
  const prefixBySlug: Record<string, string> = {
    "pe-development": "JIRA_PE",
    "platform-development": "JIRA_PLATFORM",
    "pe-operations": "JIRA_PE_OPS",
    "development-operations": "JIRA_DEV_OPS",
    "datalake-operations": "JIRA_DATALAKE_OPS",
  };
  const prefix = prefixBySlug[workspaceSlug];
  if (!prefix) return undefined;
  return process.env[`${prefix}_BASE_URL`]?.replace(/\/$/, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/jira-sync.test.ts`

Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add lib/jira/types.ts lib/jira/config.ts lib/data/dashboard.ts tests/jira-sync.test.ts
git commit -m "feat: allowlist three ops Jira workspace slugs"
```

---

### Task 2: Fixture workspaces + public E2E switcher coverage

**Files:**
- Modify: `data/workspaces.ts`
- Modify: `e2e/public-fixture.spec.ts`
- Test: `e2e/public-fixture.spec.ts` (and optional quick unit check via existing fixture consumers)

**Interfaces:**
- Consumes: `workspaceProjects(prefix, focusTitle)` helper already in `data/workspaces.ts`
- Produces: `workspaces` array length 6 in the spec order; switcher options for the three new slugs

- [ ] **Step 1: Extend the failing E2E expectations**

In `e2e/public-fixture.spec.ts`, inside `navigates workspaces with read-only UI...`, after the Platform Development assertions and before `expectAccessible(page)`, add:

```ts
    await page.getByRole("combobox", { name: "Workspace" }).selectOption("pe-operations");
    await expect(page).toHaveURL(/\/pe-operations$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("PE Operations");

    await page
      .getByRole("combobox", { name: "Workspace" })
      .selectOption("development-operations");
    await expect(page).toHaveURL(/\/development-operations$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Development Operations",
    );

    await page
      .getByRole("combobox", { name: "Workspace" })
      .selectOption("datalake-operations");
    await expect(page).toHaveURL(/\/datalake-operations$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Data Lake Operations",
    );
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npm run test:e2e:public -- --grep "navigates workspaces"`

Expected: FAIL — selectOption cannot find `pe-operations` (or navigation/heading mismatch) because fixture list lacks the new workspaces.

- [ ] **Step 3: Add the three fixture workspaces**

In `data/workspaces.ts`, keep existing three entries, then append (order matters):

```ts
  {
    slug: "pe-operations",
    name: "PE Operations",
    description: "Operational delivery health for the promo engine operations team.",
    projects: workspaceProjects("pe-ops", "PE Operations Priorities"),
  },
  {
    slug: "development-operations",
    name: "Development Operations",
    description: "Operational delivery health for the development operations team.",
    projects: workspaceProjects("dev-ops", "Development Operations Priorities"),
  },
  {
    slug: "datalake-operations",
    name: "Data Lake Operations",
    description: "Operational delivery health for the data lake operations team.",
    projects: workspaceProjects("datalake-ops", "Data Lake Operations Priorities"),
  },
```

Final `workspaces` order must be: hot-topics → pe-development → platform-development → pe-operations → development-operations → datalake-operations.

- [ ] **Step 4: Re-run E2E to verify it passes**

Run: `npm run test:e2e:public -- --grep "navigates workspaces"`

Expected: PASS.

Also run: `npx vitest run tests/initial-dashboard.test.ts tests/dashboard-shell.test.tsx`

Expected: PASS (no regressions from fixture shape).

- [ ] **Step 5: Commit**

```bash
git add data/workspaces.ts e2e/public-fixture.spec.ts
git commit -m "feat: add ops workspaces to fixture switcher"
```

---

### Task 3: Database migration + seed

**Files:**
- Create: `supabase/migrations/0008_ops_workspaces.sql`
- Modify: `supabase/seed.sql`
- Test: `tests/database-contract.test.ts` (seed path); optionally a focused assertion added below

**Interfaces:**
- Consumes: existing workspace/status UUID scheme; `workspace_jira_settings` + `jira_status_mappings` from migrations `0006`/`0007`
- Produces:
  - Workspace IDs:
    - `pe-operations` → `10000000-0000-4000-8000-000000000004`
    - `development-operations` → `10000000-0000-4000-8000-000000000005`
    - `datalake-operations` → `10000000-0000-4000-8000-000000000006`
  - Status IDs `20000000-0000-4000-8000-00000000000d` … `000000000018` (4 per new workspace)
  - `sort_order`: hot-topics `0`, pe-development `1`, platform-development `2`, pe-operations `3`, development-operations `4`, datalake-operations `5`

- [ ] **Step 1: Add a seed-order assertion that fails on current seed**

In `tests/database-contract.test.ts`, add:

```ts
  it("seeds six workspaces in product order", async () => {
    const rows = await db.query<{ slug: string; sort_order: number }>(`
      select slug, sort_order
        from public.workspaces
       order by sort_order
    `);
    expect(rows.rows.map((row) => row.slug)).toEqual([
      "hot-topics",
      "pe-development",
      "platform-development",
      "pe-operations",
      "development-operations",
      "datalake-operations",
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/database-contract.test.ts -t "seeds six workspaces"`

Expected: FAIL — only three seed workspaces and/or wrong PE vs Platform order.

- [ ] **Step 3: Update `supabase/seed.sql` workspace + status inserts**

Replace the workspaces insert with:

```sql
insert into public.workspaces (id, slug, name, description, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', 'hot-topics', 'Hot Topics', 'Cross-team operational priorities and escalations.', 0),
  ('10000000-0000-4000-8000-000000000003', 'pe-development', 'PE Development', 'Platform engineering delivery workspace.', 1),
  ('10000000-0000-4000-8000-000000000002', 'platform-development', 'Platform Development', 'Platform development delivery workspace.', 2),
  ('10000000-0000-4000-8000-000000000004', 'pe-operations', 'PE Operations', 'PE operations delivery workspace.', 3),
  ('10000000-0000-4000-8000-000000000005', 'development-operations', 'Development Operations', 'Development operations delivery workspace.', 4),
  ('10000000-0000-4000-8000-000000000006', 'datalake-operations', 'Data Lake Operations', 'Data lake operations delivery workspace.', 5)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;
```

Keep existing Hot Topics / Platform / PE status rows (`0001`–`000c`). Append statuses for the three new workspaces:

```sql
  ('20000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000004', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000004', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000004', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000005', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000005', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000005', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000005', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000006', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000006', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000006', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000006', 'Completed', '#16a34a', 3, 'completed')
```

Do **not** seed work items for the ops workspaces. Do **not** touch Jira tables from seed (tables may be absent in core-only PGlite suites).

- [ ] **Step 4: Create `supabase/migrations/0008_ops_workspaces.sql`**

```sql
-- Add PE / Development / Data Lake Operations workspaces (Jira-mirrored).
-- workspaces.sort_order is globally unique; bump before swapping PE vs Platform.

update public.workspaces
   set sort_order = 100
 where slug = 'platform-development'
   and sort_order = 1;

update public.workspaces
   set sort_order = 1
 where slug = 'pe-development';

update public.workspaces
   set sort_order = 2
 where slug = 'platform-development';

insert into public.workspaces (id, slug, name, description, sort_order)
values
  ('10000000-0000-4000-8000-000000000004', 'pe-operations', 'PE Operations', 'PE operations delivery workspace.', 3),
  ('10000000-0000-4000-8000-000000000005', 'development-operations', 'Development Operations', 'Development operations delivery workspace.', 4),
  ('10000000-0000-4000-8000-000000000006', 'datalake-operations', 'Data Lake Operations', 'Data lake operations delivery workspace.', 5)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
values
  ('20000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000004', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000004', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000004', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000005', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000005', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000005', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000005', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000006', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000006', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000006', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000006', 'Completed', '#16a34a', 3, 'completed')
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

insert into public.workspace_jira_settings (workspace_id, enabled)
select id, true
  from public.workspaces
 where slug in ('pe-operations', 'development-operations', 'datalake-operations')
on conflict (workspace_id) do update
set enabled = excluded.enabled;

insert into public.jira_status_mappings (workspace_id, jira_status_name, status_id)
select w.id, mapping.jira_status_name, s.id
  from public.workspaces w
 cross join (
   values
     ('To Do', 'In Progress'),
     ('Open', 'In Progress'),
     ('Backlog', 'In Progress'),
     ('Selected for Development', 'In Progress'),
     ('In Progress', 'In Progress'),
     ('In Review', 'In Progress'),
     ('In Development', 'In Progress'),
     ('Code Review', 'In Progress'),
     ('QA', 'In Progress'),
     ('Testing', 'In Progress'),
     ('Blocked', 'At Risk'),
     ('On Hold', 'At Risk'),
     ('Impediment', 'At Risk'),
     ('Done', 'Completed'),
     ('Closed', 'Completed'),
     ('Resolved', 'Completed'),
     ('Cancelled', 'Completed'),
     ('Canceled', 'Completed')
 ) as mapping(jira_status_name, dashboard_status_name)
 join public.statuses s
   on s.workspace_id = w.id
  and s.name = mapping.dashboard_status_name
 where w.slug in ('pe-operations', 'development-operations', 'datalake-operations')
on conflict (workspace_id, jira_status_name) do update
set status_id = excluded.status_id,
    updated_at = now();
```

- [ ] **Step 5: Run database tests**

Run: `npx vitest run tests/database-contract.test.ts`

Expected: PASS, including `seeds six workspaces in product order`.

Also run: `npm run test:database`

Expected: PASS (other PGlite suites still apply older migrations + seed; new seed rows must not break them).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0008_ops_workspaces.sql supabase/seed.sql tests/database-contract.test.ts
git commit -m "feat: seed and migrate three ops workspaces"
```

---

### Task 4: Env docs + README

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (Jira integration section + seed blurb around lines 57–60)

**Interfaces:**
- Consumes: prefixes and webhook paths from Tasks 1–3
- Produces: documented placeholder env groups; no real secrets

- [ ] **Step 1: Extend `.env.example`**

After the Platform Development block, append:

```bash
# PE Operations workspace -> pe-ops Jira Cloud instance
JIRA_PE_OPS_BASE_URL=https://pe-ops.atlassian.net
JIRA_PE_OPS_EMAIL=
JIRA_PE_OPS_API_TOKEN=
JIRA_PE_OPS_JQL=project = SCRUM ORDER BY updated DESC
JIRA_PE_OPS_WEBHOOK_SECRET=
JIRA_PE_OPS_PROGRESS_FIELD_ID=

# Development Operations workspace -> orange-dev-ops Jira Cloud instance
JIRA_DEV_OPS_BASE_URL=https://orange-dev-ops.atlassian.net
JIRA_DEV_OPS_EMAIL=
JIRA_DEV_OPS_API_TOKEN=
JIRA_DEV_OPS_JQL=project = SCRUM ORDER BY updated DESC
JIRA_DEV_OPS_WEBHOOK_SECRET=
JIRA_DEV_OPS_PROGRESS_FIELD_ID=

# Data Lake Operations workspace -> datalake-ops Jira Cloud instance
JIRA_DATALAKE_OPS_BASE_URL=https://datalake-ops.atlassian.net
JIRA_DATALAKE_OPS_EMAIL=
JIRA_DATALAKE_OPS_API_TOKEN=
JIRA_DATALAKE_OPS_JQL=project = SCRUM ORDER BY updated DESC
JIRA_DATALAKE_OPS_WEBHOOK_SECRET=
JIRA_DATALAKE_OPS_PROGRESS_FIELD_ID=
```

Leave `EMAIL` / `API_TOKEN` / `WEBHOOK_SECRET` blank in the repo.

- [ ] **Step 2: Update README Jira section**

Replace the intro paragraph so it states five Jira-linked workspaces + Hot Topics manual.

Update the env table to include:

| Variable | Workspace |
| --- | --- |
| `JIRA_PE_*` | PE Development |
| `JIRA_PLATFORM_*` | Platform Development |
| `JIRA_PE_OPS_*` | PE Operations |
| `JIRA_DEV_OPS_*` | Development Operations |
| `JIRA_DATALAKE_OPS_*` | Data Lake Operations |

Update the webhook URL table to add:

| Workspace | URL |
| --- | --- |
| PE Operations | `https://<your-app>/api/jira/webhook/pe-operations` |
| Development Operations | `https://<your-app>/api/jira/webhook/development-operations` |
| Data Lake Operations | `https://<your-app>/api/jira/webhook/datalake-operations` |

Update seed docs (~lines 57–60) to list all six workspaces and note that only Hot Topics is seeded with projects/comments; Jira-linked boards stay empty until sync.

Update the “After sync, PE/Platform show…” sentence to say all Jira-linked workspaces show Jira status names.

- [ ] **Step 3: Sanity checks**

Run: `npm run typecheck`

Expected: PASS.

Run: `npx vitest run tests/jira-sync.test.ts tests/database-contract.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document ops Jira workspaces and env vars"
```

---

## Self-review vs spec

| Spec requirement | Task |
|------------------|------|
| Six workspaces in stated order | Tasks 2–3 |
| Jira mirror for three new boards | Tasks 1, 3 |
| Env prefixes + `.env.example` / README | Task 4 |
| Status mappings from `0007` | Task 3 migration |
| Fixture + switcher | Task 2 |
| Unit + E2E coverage | Tasks 1–2 |
| Secrets never committed | Task 4 + Global Constraints |
| Operator webhook setup | Documented in Task 4 / README (manual) |

No Approach-2 registry refactor. No Hot Topics content changes. No committed tokens.
