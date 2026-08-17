# Department Structure Portfolio Page

**Date:** 2026-08-17  
**Status:** Approved for planning (pending user review of this written spec)  
**Approach:** Public portfolio page + separate admin editor (Approach 2)

## Goal

Add a department portfolio overview at `/dept-structure`: a single artistic long-scroll page covering org structure, teams, projects, deep-dives, and timeline. Content is fully manual (independent of Jira dashboards). Admins edit via a separate dense editor at `/dept-structure/edit`. The page is reachable **by URL only** — no nav links from other dashboard pages.

## Decisions

| Topic | Decision |
|-------|----------|
| Discovery | URL-only (`/dept-structure`); no workspace switcher entry; no links from other pages |
| View access | Public (anyone with the URL) |
| Edit access | Admins only (`getAdminStatus` / `admin_users`), same pattern as status settings |
| Editing UX | Separate admin route `/dept-structure/edit` (not inline on the public page) |
| Data source | Fully manual — typed counts, teams, members, projects, timeline; no Jira sync |
| Glance stats | Fully manual overrides (teams, members, active projects, on-track %) |
| Storage | Dedicated Supabase tables + admin RLS mutations |
| Team count | Stable range **1–5**; visual system authored for 5; clean reflow for fewer |
| Highlighted projects | Max **3** highlighted; block a 4th with a clear message |
| Starter content | Seeded realistic Orange Egypt placeholder content (5 teams + sample projects/timeline) |
| Scope (v1) | Full portfolio: glance, mission, structure, per-team chapters, highlighted projects, project deep-dives, timeline |
| Visual system | Existing Orange tokens (`#e56f18`, cream `#f7f6f3`, etc.) — artistic scroll, not PPT clone, not dashboard chrome |

## Architecture

### Routes

| Route | Audience | Role |
|-------|----------|------|
| `/dept-structure` | Public | Long-scroll portfolio; read-only |
| `/dept-structure/edit` | Admin | Form/table CRUD for all dept entities |

Non-admins hitting `/dept-structure/edit` follow the same login / deny pattern as `[workspaceSlug]/settings/statuses`.

No changes to workspace switcher or other page nav for discovery.

### Database

New migration (e.g. `0009_dept_structure.sql`) plus matching `supabase/seed.sql` updates.

Suggested tables:

1. **`dept_profile`** (singleton row)
   - `mission` (text)
   - `department_head_name` (text)
   - `department_head_title` (text, optional)
   - Manual glance fields: `stat_teams`, `stat_members`, `stat_active_projects`, `stat_on_track_pct`
   - Optional hero support line / brand subtitle fields if needed for the first viewport

2. **`dept_teams`**
   - `id`, `name`, `lead_name`, `focus`, `goal`, `scope` (short one-liner for structure grid)
   - `sort_order`
   - Constraint / app validation: **at most 5 rows**

3. **`dept_members`**
   - `id`, `team_id` → `dept_teams`
   - `name`, `role` (optional), `sort_order`

4. **`dept_projects`**
   - `id`, optional `team_id`
   - `title`, `summary`
   - `is_highlighted` (boolean)
   - Deep-dive: `owner_name`, `start_date`, `end_date`, `progress_pct`, `status_label`
   - `sort_order`
   - App validation: at most **3** rows with `is_highlighted = true`

5. **`dept_milestones`**
   - `id`, `project_id` → `dept_projects`
   - `title`, `due_date` (optional), `is_done`, `sort_order`

6. **`dept_timeline_items`**
   - `id`, `label`, `start_date`, `end_date` (optional), `status_label`, `sort_order`

**RLS**

- Public / authenticated: `SELECT` allowed on all dept tables.
- Mutations (`INSERT` / `UPDATE` / `DELETE`): admin only, matching existing `admin_users` patterns used elsewhere in the app.

**Seed**

- One `dept_profile` row with mission + manual glance numbers.
- **Five** teams with leads, focus, goals, scopes, and sample members.
- Several projects (≤3 highlighted) with optional milestones.
- A short timeline set so the public page looks complete on first load.

### Application layers

- **Data loaders** under something like `lib/data/dept-structure.ts` — fetch profile, teams+members, projects+milestones, timeline for the public page and edit page.
- **Mutations** — server actions or API routes that check admin status before writing; validate max teams (5) and max highlights (3).
- **UI**
  - `app/dept-structure/page.tsx` — public portfolio composition
  - `app/dept-structure/edit/page.tsx` — admin editor shell
  - Components under `components/dept-structure/` (public sections) and `components/dept-structure/edit/` (forms)

Independent of `data/workspaces.ts` and Jira sync paths.

## Public page layout (`/dept-structure`)

One composition, long scroll, one job per section. Keep existing Orange color system and atmospheric background language.

1. **Hero / brand** — Department / product name as hero-level brand signal; one headline; one short supporting sentence; full-bleed atmosphere. No cards, stats, overlays, or secondary marketing blocks in the first viewport.
2. **At a glance** — Fixed 4-up grid of manual stats: teams, members, active projects, on-track %. Always four slots.
3. **Mission** — Single statement block.
4. **Structure** — Department head + team grid for **1–5 teams**. Each cell: name, lead, member count (derived from members list for display in structure is allowed as presentation; glance stat remains manual), project count (presentation from linked projects optional), one-line scope. Reflow rules:
   - 5 → full row (or designed 5-up)
   - 4 → 2×2
   - 3 → 3-up
   - 2 → 2-up
   - 1 → single centered/full-width block
5. **Teams deep-dive** — One chapter per team in `sort_order`: lead, focus, goal, members. Same template for every team so density stays even.
6. **Highlighted projects** — Up to 3 highlighted projects in a stable strip. Do not invent a 4th slot when fewer than 3 exist; avoid unpredictable stretch.
7. **Project deep-dives** — Detail for projects that have deep-dive fields / milestones (owner, dates, progress, milestones). Prefer expand/collapse or clear stacked sections without card clutter in non-interactive chrome.
8. **Timeline** — Ordered roadmap of `dept_timeline_items`; horizontal on desktop, vertical on small screens.

**Stability rules**

- Authored for five teams; must not break or leave awkward holes when count is 1–4.
- Optional empty fields render as muted placeholders or omit quietly — never collapse section structure into a broken layout.
- No link-outs required into Jira or workspace dashboards for v1.

## Admin editor (`/dept-structure/edit`)

Dense, form-first, on-brand but practical (not the artistic scroll).

Sections:

1. **Profile & glance** — mission, department head, four manual stats; Save.
2. **Teams** — list with add / remove / reorder; **hard max 5**. Per team: name, lead, focus, goal, scope + nested members CRUD.
3. **Projects** — CRUD; optional team assignment; highlight toggle (block if already 3 highlighted); deep-dive fields + milestones CRUD.
4. **Timeline** — ordered items with up/down reorder; label, dates, status.

Save pattern: explicit per-section (or per-entity) save buttons. On failure, retain form values and show an error banner/toast. Successful saves are visible on `/dept-structure` after refresh (no realtime requirement for v1).

## Visual language & interaction

- Tokens from `app/globals.css` (`--orange`, `--background`, etc.).
- Expressive typography appropriate to a branded portfolio page (may introduce a display font for this route only if needed; avoid generic “AI default” purple/cream-serif clichés that conflict with Orange).
- Cards only where interaction requires a container (e.g. expandable project). Default: no cards in hero; prefer open sections.
- Motion: 2–3 intentional effects (section reveal, project expand, timeline emphasis) — presence, not noise.
- Mobile: same section order; stacks cleanly.

## Error handling & edge cases

| Case | Behavior |
|------|----------|
| 0 teams | Calm empty structure + empty deep-dive states |
| Attempt 6th team | UI + server validation reject with message |
| Attempt 4th highlight | Block with message; do not auto-unhighlight |
| Missing optional fields | Hide or show “—”; layout stays intact |
| Non-admin opens edit URL | Login / deny per existing admin gate |
| Save failure | Keep values; show error |

## Testing

- Migration + RLS: public/anon can `SELECT`; only admins can mutate.
- Validation: max 5 teams; max 3 highlights.
- Seed: public page renders complete placeholder portfolio.
- Edit gate: non-admin cannot mutate; edit page protected.
- Layout smoke: render with 1, 4, and 5 teams without overflow or broken gaps.
- No workspace nav regression: other pages still have no link to `/dept-structure`.

## Out of scope (v1)

- Jira / workspace dashboard coupling or auto-derived glance stats
- Nav discovery (switcher, header links, homepage promo)
- Realtime collaborative editing
- Inline editing on the public page
- More than 5 teams or more than 3 highlighted projects
- Image uploads / org chart builder drag-canvas
- PPT import/export

## Implementation notes (for planning)

- Follow existing Supabase migration + seed + `types/database.ts` update patterns.
- Reuse `getAdminStatus` from `lib/data/initial-dashboard.ts` (or shared admin helper) for the edit gate.
- Keep dept-structure code isolated under dedicated app routes and components so dashboard Jira paths stay untouched.
- After this spec is approved, create an implementation plan under `docs/superpowers/plans/` before coding.
