# Orange Dashboards

A public, read-only delivery dashboard with authenticated Supabase-backed administration, custom statuses, comments, immutable activity history, and realtime updates.

## Architecture

- **Next.js App Router / React / TypeScript** render workspace, login, status settings, and history routes.
- **Supabase Postgres** stores workspaces, statuses, projects/subtasks, comments, administrators, and activity history.
- **Supabase Auth** provides email/password sessions. The application has no public sign-up flow.
- **Row Level Security (RLS)** permits anonymous reads of dashboard data, restricts mutations and history to rows in `admin_users`, and keeps administrator records private.
- **Supabase Realtime** publishes workspace, status, work-item, and comment changes. Clients refetch an authoritative workspace snapshot after relevant events.
- **Local fixture mode** is used when no public Supabase environment is configured. It is intentionally read-only and supports local development and public E2E tests without credentials.
- **Tests** use Vitest/Testing Library for unit and integration coverage, PGlite for credential-free PostgreSQL migration and policy contracts, and Playwright plus axe for browser and accessibility coverage.

No `vercel.json` is required: Vercel detects Next.js and uses the standard build output.

## Requirements and local setup

1. Install Node 22 (`nvm use`; `.nvmrc` and `package.json` enforce the supported major).
2. Install dependencies with `npm ci`.
3. Copy `.env.example` to `.env.local` only when connecting Supabase. Never commit that file.
4. Run `npm run dev`, then open `http://localhost:3000`.

With all three public Supabase variables absent, `/` redirects to `/hot-topics` and
serves the built-in public fixture. A URL plus either supported key enables Supabase.
Any partial configuration throws an explicit startup/request error instead of silently
falling back. Admin routes return to the workspace in fixture mode because it has no
authentication or write bypass.

## Supabase local development

Install Docker, then use the repository-pinned Supabase CLI (`supabase` 2.109.1 is an
exact development dependency):

```bash
npx supabase start
npx supabase db reset
npx supabase status
```

`db reset` recreates the local database, applies every file in `supabase/migrations/`, and runs `supabase/seed.sql`. Copy the local API URL and publishable/anon key reported by `supabase status` into `.env.local`; do not copy the service-role key into browser or Vercel variables.

To work with an existing hosted project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Always inspect the linked project and the dry-run output before applying migrations. Do not create a new project merely because a link is missing.

## Seed data and future imports

`supabase/seed.sql` is deterministic. It creates Hot Topics, Platform Development, and
PE Development workspaces and their statuses; only Hot Topics is currently seeded with
projects and comments. Re-running `supabase db reset` is destructive and is for
local/test databases only.

For future PE or Platform imports:

1. Export and normalize source data outside the application. Do not edit the legacy HTML files in place.
2. Assign stable UUIDs and preserve a source identifier in import comments or a separate mapping file.
3. Insert the workspace first, then workspace-scoped statuses, top-level work items, subtasks with matching `workspace_id`, and comments.
4. Keep status names unique per workspace, sort orders contiguous, progress between 0 and 100, and end dates on/after start dates.
5. Add an idempotent seed/import SQL file and test it with `npm run test:database` plus a disposable `supabase db reset`.
6. Review public visibility before loading sensitive descriptions or comments; dashboard rows are intentionally readable by anonymous users.

## Realtime

Migration `0002_security_audit_realtime.sql` enables the relevant tables in the `supabase_realtime` publication. Realtime transports notifications only; clients refetch under the current user's RLS policy and never trust an event payload as authorization.

For local troubleshooting, confirm Supabase is running, the browser uses the same local URL/key, tables are in the realtime publication, and the page's connection indicator reaches **Live**. The cloud E2E suite opens two independent browser contexts to verify propagation.

## Create an administrator

Sign-up is disabled. Create the user manually in **Supabase Dashboard → Authentication → Users → Add user**, using email/password and marking the email confirmed as appropriate. Then grant application administration in the SQL editor:

```sql
insert into public.admin_users (auth_user_id, email, display_name)
select id, email, coalesce(raw_user_meta_data ->> 'display_name', email)
from auth.users
where email = 'admin@example.com'
on conflict (auth_user_id) do update
set email = excluded.email,
    display_name = excluded.display_name;
```

Replace the example email and verify exactly one intended Auth user is selected. Removing the `admin_users` row revokes application write/history access without deleting the Auth account.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: project API URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: preferred browser-safe publishable key.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: supported legacy alternative to the publishable key.
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_WORKSPACE_SLUG`: cloud E2E administrator and disposable workspace.
- `E2E_BASE_URL`: optional deployed application URL; without it Playwright starts Next.js locally.

Cloud E2E credentials belong only in a local secret store or CI secret configuration.
Cloud Playwright runs disable traces, videos, and screenshots so credentials cannot be
captured in browser artifacts; CI should retain only the text result summary and must
not print environment values. Cloud runs use the line reporter only; no cloud HTML
report is generated. Public fixture E2E may retain failure artifacts
because it receives no credentials. No service-role key is required by the application
or tests.

## Scripts and testing matrix

- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript without emission.
- `npm run test:unit` — unit/integration tests excluding PGlite suites.
- `npm run test:database` — credential-free migration, RLS, audit, history, and reorder contracts in PGlite.
- `npm test` — complete Vitest unit/integration/PGlite suite.
- `npm run test:e2e:public` — credential-free Chromium tests against fixture mode, including navigation, read-only behavior, responsive layout, dialogs, login, route protection, and axe checks.
- `npm run test:e2e:cloud` — Supabase-backed login, CRUD, custom status, history, accessibility, and two-context realtime tests. It exits with an explicit missing-variable error and never silently skips.
- `npm run build` — production Next.js build.
- `npm run audit` — reports dependency advisories without applying fixes.
- `npm run verify:local` — lint, typecheck, complete Vitest suite, build, and credential-free public fixture E2E.
- `npm run verify:cloud` — cloud-only E2E and its explicit credential preflight.
- `npm run verify` — convenient alias for `verify:local`.
- `npm run verify:full` — runs local verification and then cloud verification; it intentionally fails fast rather than skipping when cloud credentials are absent.

Install the browser once with `npx playwright install chromium`. The cloud suite performs CRUD: use a dedicated test project or disposable workspace and ensure the configured user is present in `admin_users`.

PGlite is the fast, credential-free database gate. For PostgreSQL/Supabase parity, start the local stack and run `npx supabase test db`; add pgTAP files under `supabase/tests/` as database behavior grows.

## Vercel deployment

1. Import the repository into Vercel and select the Next.js framework preset.
2. Use Node 22 and the default `npm run build`.
3. Configure the Supabase URL and publishable key for Preview and Production. Do not add a service-role key.
4. Add each deployed origin to Supabase Auth Site URL/redirect URLs.
5. Link and migrate the intended Supabase project separately with the CLI workflow above.
6. Deploy, then run the smoke checks below. Keep E2E admin credentials in CI secrets only if cloud E2E is intentionally enabled.

### Production smoke test

Against the production URL:

1. Load each public workspace in a private window; verify projects render, admin controls do not, and the connection becomes Live.
2. Switch workspaces and open/close a project dialog with mouse, keyboard, and Escape.
3. Visit `/login`, sign in as an administrator, and verify project/subtask/comment CRUD with disposable records.
4. Create/edit/delete a disposable custom status, verify History records the operations, and remove all disposable records.
5. Keep a private public window open while mutating in the admin window and verify realtime updates.
6. Run `E2E_BASE_URL=https://… npm run test:e2e:cloud` only against an approved test deployment/workspace.

## Backup, export, and restore

Before schema changes or bulk imports, use project-specific secure paths:

```bash
npx supabase db dump --linked --file ./private/schema.sql
npx supabase db dump --linked --data-only --use-copy --file ./private/data.sql
```

Keep dumps encrypted and outside version control; they may contain public dashboard
content, administrator emails, and history. A standard `supabase db dump` covers the
application database but does **not** recreate managed Supabase Auth identities. A
portable restore must therefore defer/omit `public.admin_users`, restore application
schema/data into a disposable target, recreate each Auth user through the Supabase
Dashboard or supported Admin API, and then insert new `admin_users.auth_user_id`
mappings using the new Auth UUIDs.

Test the application portion of a restore only against a disposable database:

```bash
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./private/schema.sql
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./private/data.sql
```

The data command above may include `public.admin_users`; do not apply those rows until
matching Auth identities exist, because the foreign key references `auth.users`.
Provider-supported full-project restore, Auth coverage, cross-project portability,
managed backup/PITR retention, and target-project restrictions depend on the current
Supabase plan and tooling. Confirm those limits before treating a managed backup as a
full disaster-recovery path.

Never restore over production without a maintenance window, a verified backup, and a
rollback plan.

## Security

- Anonymous and authenticated users can read dashboard workspace/status/work-item/comment rows by design.
- Only authenticated users whose Auth UUID exists in `admin_users` can mutate dashboard data or read activity history.
- RLS is the enforcement boundary; hidden buttons and redirects are usability controls, not authorization.
- Audit history survives source-row deletion. Avoid placing secrets in titles, descriptions, comments, history, logs, fixtures, or E2E names.
- Publishable/anon keys are browser-safe identifiers constrained by RLS. Service-role keys bypass RLS and must never be shipped to the client.
- There are no production test bypasses. Fixture mode activates only when public Supabase configuration is absent and remains read-only.

## Free-tier and inactivity considerations

Supabase and Vercel free-tier quotas, sleep/pause behavior, build limits, bandwidth, database size, log retention, and backup availability can change. Check current provider limits before production use. A paused or inactive Supabase project can cause slow first loads, connection errors, or failed realtime subscriptions; resume it in the dashboard and rerun the smoke test. Do not use synthetic writes solely to evade provider inactivity policies.

## Troubleshooting

- **Fixture appears instead of database data:** both the Supabase URL and publishable/anon key must be present; restart Next.js after changing `.env.local`. Partial configuration fails loudly by design.
- **Sign-in succeeds but admin controls are absent:** confirm the Auth user's UUID, not merely email, exists in `public.admin_users`.
- **Admin route redirects to login:** clear stale cookies, confirm allowed Auth redirect URLs, and verify the browser is using the same project as the database grant.
- **Reads work but writes fail:** inspect RLS and `public.is_admin()`, then check the browser session; never solve this with a service-role browser key.
- **Realtime remains disconnected:** confirm publication membership, project status, network/WebSocket access, and public read policies.
- **Migration fails:** run PGlite tests, inspect `supabase migration list`, verify the linked project, and use `db push --dry-run` before retrying.
- **Playwright browser missing:** run `npx playwright install chromium`.
- **Cloud E2E exits before tests:** populate every variable named in the error. This is intentional fail-fast behavior.
- **Node engine warnings:** run `nvm use` and reinstall with Node 22.
