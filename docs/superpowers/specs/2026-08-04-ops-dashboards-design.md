# Add Operations Dashboards (Jira-mirrored)

**Date:** 2026-08-04  
**Status:** Approved for planning  
**Approach:** Extend the existing PE/Platform Jira workspace pattern (Approach 1)

## Goal

Add three new dashboards so the product has six workspaces total, in this order:

1. `hot-topics` — Hot Topics (unchanged; manual)
2. `pe-development` — PE Development (unchanged; Jira-linked)
3. `platform-development` — Platform Development (unchanged; Jira-linked)
4. `pe-operations` — PE Operations (**new**; Jira-linked)
5. `development-operations` — Development Operations (**new**; Jira-linked)
6. `datalake-operations` — Data Lake Operations (**new**; Jira-linked)

## Decisions

| Topic | Decision |
|-------|----------|
| Behavior | Jira one-way mirror, same as PE/Platform Development |
| Starter content | No seeded work items; statuses + Jira settings only (fixture may use shared sample projects like PE/Platform) |
| JQL | `project = SCRUM ORDER BY updated DESC` for all three (separate Jira Cloud sites) |
| Secrets | Env-only (Vercel / `.env.local`). Never commit API tokens or webhook secrets |
| Status mappings | Reuse the corrected mapping set from migration `0007_fix_jira_status_mappings.sql` |
| UI | No new dashboard chrome; workspace switcher lists all six |

## Architecture

### Identity & ordering

- Update `data/workspaces.ts` so fixture mode and the workspace switcher expose all six slugs in the order above.
- Align DB `sort_order`: Hot Topics `0`, PE Development `1`, Platform Development `2`, then the three ops workspaces `3`–`5`.
- Existing seed currently orders Platform before PE; fix that in seed + migration so product order is consistent.

### Database

New migration (e.g. `0008_ops_workspaces.sql`):

1. Insert three workspaces with stable UUIDs, names, descriptions, and `sort_order` 3–5.
2. Update existing workspace `sort_order` so PE Development precedes Platform Development.
3. Insert the standard four statuses per new workspace (In Progress, At Risk, Delayed, Completed) with the same colors/reporting categories as existing seeds.
4. Enable `workspace_jira_settings` (`enabled = true`) for the three new slugs.
5. Insert Jira status mappings for the three new slugs using the same name pairs as migration `0007`.

Update `supabase/seed.sql` to match so `supabase db reset` stays deterministic and ordered correctly.

### Jira configuration

Extend allowlists in:

- `lib/jira/types.ts` — `JiraWorkspaceSlug`
- `lib/jira/config.ts` — slug list + `envPrefixForSlug`
- `lib/data/dashboard.ts` — `resolveJiraBrowseBaseUrl`

Env prefixes:

| Workspace slug | Env prefix |
|----------------|------------|
| `pe-operations` | `JIRA_PE_OPS` |
| `development-operations` | `JIRA_DEV_OPS` |
| `datalake-operations` | `JIRA_DATALAKE_OPS` |

Each prefix needs: `BASE_URL`, `EMAIL`, `API_TOKEN`, `JQL`, `WEBHOOK_SECRET`, optional `PROGRESS_FIELD_ID`.

Document placeholders in `.env.example` and README. Real credentials remain outside the repository.

Webhook URLs (already served by `app/api/jira/webhook/[workspaceSlug]/route.ts` once slugs are allowlisted):

- `/api/jira/webhook/pe-operations`
- `/api/jira/webhook/development-operations`
- `/api/jira/webhook/datalake-operations`

Cron sync via `/api/jira/sync` picks up any slug returned by `listConfiguredJiraWorkspaces()` when env is complete.

### Application behavior

- Jira-linked workspaces remain read-only for manual work-item/status/comment mutations (existing RLS).
- Hot Topics stays fully manual.
- No product UI changes beyond switcher options and docs.

## Testing

- Unit: extend `tests/jira-sync.test.ts` so new slugs are recognized and non-Jira slugs still are not.
- E2E (public fixture): extend workspace switcher navigation coverage to select and land on all three new ops slugs.
- Database: migration/seed must apply cleanly under existing PGlite / `test:database` path; no special Jira network calls in DB tests.
- Docs: README Jira section lists six dashboards and the three new env/webhook entries.

## Out of scope

- Committing real Jira API tokens or webhook secrets
- Changing Hot Topics content or PE/Platform Jira project keys
- Refactoring to a fully config-driven Jira registry (Approach 2)
- Custom per-ops dashboard layouts or non-Jira starter projects in seed
- Creating Jira Cloud webhooks in Atlassian (manual post-deploy step for the operator)

## Operator follow-up (after deploy)

1. Set the three new env var groups in Vercel (and local `.env.local` as needed).
2. Create one Jira webhook per Cloud site with the matching secret and clean webhook URL.
3. Trigger `/api/jira/sync` (or wait for cron) and confirm issues appear on each ops dashboard.
4. Rotate any API tokens that were shared in chat if those channels are untrusted.
