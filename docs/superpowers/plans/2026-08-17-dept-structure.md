# Department Structure Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a URL-only public portfolio at `/dept-structure` plus admin editor at `/dept-structure/edit`, backed by Supabase `dept_*` tables with seeded Orange Egypt placeholder content.

**Architecture:** Public long-scroll page reads dept tables (or fixture fallback). Admin edit page uses statuses-style auth gate + browser Supabase mutations under RLS. No workspace switcher / nav links. Team count constrained to 1–5; highlighted projects max 3.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (migrations/seed/RLS), Vitest, existing CSS tokens / form patterns.

**Spec:** `docs/superpowers/specs/2026-08-17-dept-structure-design.md`

## Global Constraints

- Discovery: URL-only — do not add nav links or workspace-switcher entries.
- Public read; admin-only mutations via `is_admin()` RLS.
- Glance stats are fully manual (not derived).
- Max 5 teams; max 3 highlighted projects (UI + server validation).
- Fixture mode: public page uses static fixture data; edit redirects away when no Supabase env.
- Match existing patterns: client mutations + RLS (no new `"use server"` actions), `getAdminStatus` / login redirect for edit gate.
- Keep Orange design tokens; artistic public page, dense practical edit page.

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/0009_dept_structure.sql` | Tables, triggers, constraints, RLS, grants |
| `supabase/seed.sql` | Deterministic profile, 5 teams, members, projects, milestones, timeline |
| `types/database.ts` | `dept_*` table typings |
| `data/dept-structure.ts` | Fixture portfolio payload |
| `lib/data/dept-structure.ts` | Loaders (DB + fixture) |
| `lib/data/dept-structure-mutations.ts` | Validate + CRUD mutations |
| `app/dept-structure/page.tsx` | Public portfolio |
| `app/dept-structure/edit/page.tsx` | Admin gate + editor shell |
| `components/dept-structure/*` | Public sections |
| `components/dept-structure/edit/*` | Admin forms |
| `app/globals.css` | Dept-structure-specific styles (scoped) |
| `tests/dept-structure-*.test.ts(x)` | Unit/component/DB coverage |
| `e2e/public-fixture.spec.ts` | Edit redirects in fixture; public page loads |

---

### Task 1: Schema, types, seed, fixture

**Files:** migration `0009`, `seed.sql`, `types/database.ts`, `data/dept-structure.ts`

- [ ] Create tables: `dept_profile` (singleton), `dept_teams`, `dept_members`, `dept_projects`, `dept_milestones`, `dept_timeline_items`
- [ ] Triggers `set_updated_at`; length checks; FK cascades
- [ ] Enforce max 5 teams via trigger or deferred check function; enforce max 3 highlights via trigger
- [ ] RLS: public SELECT; admin INSERT/UPDATE/DELETE; service_role ALL
- [ ] Seed fixed UUIDs (e.g. `9000…` profile, `9100…` teams, etc.) with 5 teams + sample content
- [ ] Extend `types/database.ts`
- [ ] Add `data/dept-structure.ts` fixture mirroring seed shape
- [ ] Unit/DB tests for seed count + max team/highlight constraints
- [ ] Commit

### Task 2: Loaders + mutations

**Files:** `lib/data/dept-structure.ts`, `lib/data/dept-structure-mutations.ts`, tests

- [ ] `loadDeptStructure(client | null)` → full portfolio DTO; fixture when no env / null client
- [ ] Mutations: update profile; CRUD teams/members/projects/milestones/timeline; reorder helpers
- [ ] Validation: trim/length; reject 6th team; reject 4th highlight
- [ ] Unit tests for validation + mutation error paths
- [ ] Commit

### Task 3: Public portfolio page

**Files:** `app/dept-structure/page.tsx`, `components/dept-structure/*`, CSS

- [ ] Sections: hero, glance, mission, structure (1–5 reflow), team chapters, highlighted strip, project deep-dives, timeline
- [ ] Fixture works without Supabase
- [ ] Responsive + 2–3 subtle motions
- [ ] Basic render test
- [ ] Commit

### Task 4: Admin editor

**Files:** `app/dept-structure/edit/page.tsx`, `components/dept-structure/edit/*`

- [ ] Gate: no env → redirect `/dept-structure`; no user → login; non-admin → `/dept-structure`
- [ ] Sections: profile/glance, teams+members, projects+milestones, timeline
- [ ] Explicit save; error banners; max-5 / max-3 messaging
- [ ] Link from edit header back to public view (edit→public only; still no global nav discovery)
- [ ] Component tests for gate messaging / validation UX where practical
- [ ] Commit

### Task 5: Integration polish

- [ ] Update `tests/database-contract` / security tests if they enumerate tables
- [ ] E2E: `/dept-structure` loads in fixture; `/dept-structure/edit` redirects in fixture
- [ ] `npm run test:unit` (and DB tests if feasible) green
- [ ] Update PR description
- [ ] Commit

## Done when

- Public URL shows seeded/fixture portfolio with stable 1–5 team layout
- Admins can edit all entities at `/dept-structure/edit`
- No nav links added elsewhere
- Constraints enforced; tests cover core paths
