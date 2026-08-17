-- Department structure portfolio (manual content; independent of Jira workspaces).

create table if not exists public.dept_profile (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null default 'Orange Egypt'
    check (char_length(btrim(brand_name)) between 1 and 120),
  hero_headline text not null default 'Department overview'
    check (char_length(btrim(hero_headline)) between 1 and 200),
  hero_support text not null default ''
    check (char_length(hero_support) <= 500),
  mission text not null default ''
    check (char_length(mission) <= 5000),
  department_head_name text not null default ''
    check (char_length(department_head_name) <= 200),
  department_head_title text not null default ''
    check (char_length(department_head_title) <= 200),
  stat_teams integer not null default 0
    check (stat_teams >= 0 and stat_teams <= 99),
  stat_members integer not null default 0
    check (stat_members >= 0 and stat_members <= 9999),
  stat_active_projects integer not null default 0
    check (stat_active_projects >= 0 and stat_active_projects <= 9999),
  stat_on_track_pct integer not null default 0
    check (stat_on_track_pct >= 0 and stat_on_track_pct <= 100),
  singleton_key boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dept_profile_singleton check (singleton_key = true),
  constraint dept_profile_singleton_key unique (singleton_key)
);

create table if not exists public.dept_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(btrim(name)) between 1 and 200),
  lead_name text not null default ''
    check (char_length(lead_name) <= 200),
  focus text not null default ''
    check (char_length(focus) <= 2000),
  goal text not null default ''
    check (char_length(goal) <= 2000),
  scope text not null default ''
    check (char_length(scope) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dept_teams_sort_idx
  on public.dept_teams (sort_order, name);

create table if not exists public.dept_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.dept_teams(id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 200),
  role text not null default ''
    check (char_length(role) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dept_members_team_sort_idx
  on public.dept_members (team_id, sort_order, name);

create table if not exists public.dept_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.dept_teams(id) on delete set null,
  title text not null
    check (char_length(btrim(title)) between 1 and 200),
  summary text not null default ''
    check (char_length(summary) <= 5000),
  is_highlighted boolean not null default false,
  owner_name text not null default ''
    check (char_length(owner_name) <= 200),
  start_date date,
  end_date date,
  progress_pct integer not null default 0
    check (progress_pct >= 0 and progress_pct <= 100),
  status_label text not null default ''
    check (char_length(status_label) <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dept_projects_sort_idx
  on public.dept_projects (sort_order, title);

create index if not exists dept_projects_highlighted_idx
  on public.dept_projects (is_highlighted)
  where is_highlighted = true;

create table if not exists public.dept_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.dept_projects(id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 1 and 200),
  due_date date,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dept_milestones_project_sort_idx
  on public.dept_milestones (project_id, sort_order, title);

create table if not exists public.dept_timeline_items (
  id uuid primary key default gen_random_uuid(),
  label text not null
    check (char_length(btrim(label)) between 1 and 200),
  start_date date,
  end_date date,
  status_label text not null default ''
    check (char_length(status_label) <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dept_timeline_items_sort_idx
  on public.dept_timeline_items (sort_order, label);

-- updated_at triggers
drop trigger if exists dept_profile_set_updated_at on public.dept_profile;
create trigger dept_profile_set_updated_at
before update on public.dept_profile
for each row execute function public.set_updated_at();

drop trigger if exists dept_teams_set_updated_at on public.dept_teams;
create trigger dept_teams_set_updated_at
before update on public.dept_teams
for each row execute function public.set_updated_at();

drop trigger if exists dept_members_set_updated_at on public.dept_members;
create trigger dept_members_set_updated_at
before update on public.dept_members
for each row execute function public.set_updated_at();

drop trigger if exists dept_projects_set_updated_at on public.dept_projects;
create trigger dept_projects_set_updated_at
before update on public.dept_projects
for each row execute function public.set_updated_at();

drop trigger if exists dept_milestones_set_updated_at on public.dept_milestones;
create trigger dept_milestones_set_updated_at
before update on public.dept_milestones
for each row execute function public.set_updated_at();

drop trigger if exists dept_timeline_items_set_updated_at on public.dept_timeline_items;
create trigger dept_timeline_items_set_updated_at
before update on public.dept_timeline_items
for each row execute function public.set_updated_at();

-- Max 5 teams
create or replace function public.enforce_dept_teams_max()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_count integer;
begin
  select count(*)::int into team_count from public.dept_teams;
  if tg_op = 'INSERT' and team_count >= 5 then
    raise exception 'Maximum of 5 teams allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists dept_teams_enforce_max on public.dept_teams;
create trigger dept_teams_enforce_max
before insert on public.dept_teams
for each row execute function public.enforce_dept_teams_max();

-- Max 3 highlighted projects
create or replace function public.enforce_dept_highlights_max()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  highlight_count integer;
begin
  if new.is_highlighted is distinct from true then
    return new;
  end if;

  select count(*)::int
    into highlight_count
    from public.dept_projects
   where is_highlighted = true
     and id is distinct from new.id;

  if highlight_count >= 3 then
    raise exception 'Maximum of 3 highlighted projects allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists dept_projects_enforce_highlights on public.dept_projects;
create trigger dept_projects_enforce_highlights
before insert or update of is_highlighted on public.dept_projects
for each row execute function public.enforce_dept_highlights_max();

-- RLS
alter table public.dept_profile enable row level security;
alter table public.dept_teams enable row level security;
alter table public.dept_members enable row level security;
alter table public.dept_projects enable row level security;
alter table public.dept_milestones enable row level security;
alter table public.dept_timeline_items enable row level security;

revoke all on table public.dept_profile from anon, authenticated;
revoke all on table public.dept_teams from anon, authenticated;
revoke all on table public.dept_members from anon, authenticated;
revoke all on table public.dept_projects from anon, authenticated;
revoke all on table public.dept_milestones from anon, authenticated;
revoke all on table public.dept_timeline_items from anon, authenticated;

grant select on table
  public.dept_profile,
  public.dept_teams,
  public.dept_members,
  public.dept_projects,
  public.dept_milestones,
  public.dept_timeline_items
to anon, authenticated;

grant insert, update, delete on table
  public.dept_profile,
  public.dept_teams,
  public.dept_members,
  public.dept_projects,
  public.dept_milestones,
  public.dept_timeline_items
to authenticated;

grant all on table
  public.dept_profile,
  public.dept_teams,
  public.dept_members,
  public.dept_projects,
  public.dept_milestones,
  public.dept_timeline_items
to service_role;

drop policy if exists dept_profile_public_read on public.dept_profile;
create policy dept_profile_public_read
on public.dept_profile for select to anon, authenticated using (true);

drop policy if exists dept_profile_admin_insert on public.dept_profile;
create policy dept_profile_admin_insert
on public.dept_profile for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists dept_profile_admin_update on public.dept_profile;
create policy dept_profile_admin_update
on public.dept_profile for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists dept_profile_admin_delete on public.dept_profile;
create policy dept_profile_admin_delete
on public.dept_profile for delete to authenticated
using ((select public.is_admin()));

drop policy if exists dept_teams_public_read on public.dept_teams;
create policy dept_teams_public_read
on public.dept_teams for select to anon, authenticated using (true);

drop policy if exists dept_teams_admin_insert on public.dept_teams;
create policy dept_teams_admin_insert
on public.dept_teams for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists dept_teams_admin_update on public.dept_teams;
create policy dept_teams_admin_update
on public.dept_teams for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists dept_teams_admin_delete on public.dept_teams;
create policy dept_teams_admin_delete
on public.dept_teams for delete to authenticated
using ((select public.is_admin()));

drop policy if exists dept_members_public_read on public.dept_members;
create policy dept_members_public_read
on public.dept_members for select to anon, authenticated using (true);

drop policy if exists dept_members_admin_insert on public.dept_members;
create policy dept_members_admin_insert
on public.dept_members for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists dept_members_admin_update on public.dept_members;
create policy dept_members_admin_update
on public.dept_members for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists dept_members_admin_delete on public.dept_members;
create policy dept_members_admin_delete
on public.dept_members for delete to authenticated
using ((select public.is_admin()));

drop policy if exists dept_projects_public_read on public.dept_projects;
create policy dept_projects_public_read
on public.dept_projects for select to anon, authenticated using (true);

drop policy if exists dept_projects_admin_insert on public.dept_projects;
create policy dept_projects_admin_insert
on public.dept_projects for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists dept_projects_admin_update on public.dept_projects;
create policy dept_projects_admin_update
on public.dept_projects for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists dept_projects_admin_delete on public.dept_projects;
create policy dept_projects_admin_delete
on public.dept_projects for delete to authenticated
using ((select public.is_admin()));

drop policy if exists dept_milestones_public_read on public.dept_milestones;
create policy dept_milestones_public_read
on public.dept_milestones for select to anon, authenticated using (true);

drop policy if exists dept_milestones_admin_insert on public.dept_milestones;
create policy dept_milestones_admin_insert
on public.dept_milestones for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists dept_milestones_admin_update on public.dept_milestones;
create policy dept_milestones_admin_update
on public.dept_milestones for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists dept_milestones_admin_delete on public.dept_milestones;
create policy dept_milestones_admin_delete
on public.dept_milestones for delete to authenticated
using ((select public.is_admin()));

drop policy if exists dept_timeline_items_public_read on public.dept_timeline_items;
create policy dept_timeline_items_public_read
on public.dept_timeline_items for select to anon, authenticated using (true);

drop policy if exists dept_timeline_items_admin_insert on public.dept_timeline_items;
create policy dept_timeline_items_admin_insert
on public.dept_timeline_items for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists dept_timeline_items_admin_update on public.dept_timeline_items;
create policy dept_timeline_items_admin_update
on public.dept_timeline_items for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists dept_timeline_items_admin_delete on public.dept_timeline_items;
create policy dept_timeline_items_admin_delete
on public.dept_timeline_items for delete to authenticated
using ((select public.is_admin()));

-- Seed placeholder portfolio content
insert into public.dept_profile (
  id, brand_name, hero_headline, hero_support, mission,
  department_head_name, department_head_title,
  stat_teams, stat_members, stat_active_projects, stat_on_track_pct
)
values (
  '90000000-0000-4000-8000-000000000001',
  'Orange Egypt',
  'Technology Delivery Department',
  'People, platforms, and operations that keep Orange Egypt shipping.',
  'We design, build, and run the digital platforms that power Orange Egypt — aligning engineering, operations, and data so delivery stays clear, measurable, and on track.',
  'Mouhab Mahmoud',
  'Department Head',
  5, 28, 12, 83
)
on conflict (id) do update set
  brand_name = excluded.brand_name,
  hero_headline = excluded.hero_headline,
  hero_support = excluded.hero_support,
  mission = excluded.mission,
  department_head_name = excluded.department_head_name,
  department_head_title = excluded.department_head_title,
  stat_teams = excluded.stat_teams,
  stat_members = excluded.stat_members,
  stat_active_projects = excluded.stat_active_projects,
  stat_on_track_pct = excluded.stat_on_track_pct;

insert into public.dept_teams (id, name, lead_name, focus, goal, scope, sort_order)
values
  ('91000000-0000-4000-8000-000000000001', 'PE Development', 'Sara Hassan',
   'Platform engineering product delivery and reliability features.',
   'Ship PE capabilities with predictable releases and clear ownership.',
   'Core PE product streams', 0),
  ('91000000-0000-4000-8000-000000000002', 'Platform Development', 'Omar Khalil',
   'Shared platform services, tooling, and developer experience.',
   'Provide stable foundations teams can build on without friction.',
   'Shared platform & DX', 1),
  ('91000000-0000-4000-8000-000000000003', 'PE Operations', 'Nour El-Din',
   'Day-to-day PE ops, escalations, and service health.',
   'Keep PE services healthy with fast response and clear runbooks.',
   'PE run & escalate', 2),
  ('91000000-0000-4000-8000-000000000004', 'Development Operations', 'Yasmine Farid',
   'CI/CD, environments, and delivery operations.',
   'Make every release repeatable, observable, and low-drama.',
   'Build, release, environments', 3),
  ('91000000-0000-4000-8000-000000000005', 'Data Lake Operations', 'Karim Adel',
   'Data lake reliability, pipelines, and operational readiness.',
   'Keep lake workloads trustworthy and on-SLA for consumers.',
   'Lake ops & pipelines', 4)
on conflict (id) do update set
  name = excluded.name,
  lead_name = excluded.lead_name,
  focus = excluded.focus,
  goal = excluded.goal,
  scope = excluded.scope,
  sort_order = excluded.sort_order;

insert into public.dept_members (id, team_id, name, role, sort_order)
values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Sara Hassan', 'Team Lead', 0),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'Ahmed Saleh', 'Engineer', 1),
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'Lina Mostafa', 'Engineer', 2),
  ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000002', 'Omar Khalil', 'Team Lead', 0),
  ('92000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000002', 'Hana Magdy', 'Engineer', 1),
  ('92000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000002', 'Tarek Nabil', 'Engineer', 2),
  ('92000000-0000-4000-8000-000000000007', '91000000-0000-4000-8000-000000000003', 'Nour El-Din', 'Team Lead', 0),
  ('92000000-0000-4000-8000-000000000008', '91000000-0000-4000-8000-000000000003', 'Mai Ibrahim', 'Ops Engineer', 1),
  ('92000000-0000-4000-8000-000000000009', '91000000-0000-4000-8000-000000000004', 'Yasmine Farid', 'Team Lead', 0),
  ('92000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000004', 'Ramy Fouad', 'DevOps Engineer', 1),
  ('92000000-0000-4000-8000-00000000000b', '91000000-0000-4000-8000-000000000005', 'Karim Adel', 'Team Lead', 0),
  ('92000000-0000-4000-8000-00000000000c', '91000000-0000-4000-8000-000000000005', 'Dina Samir', 'Data Engineer', 1)
on conflict (id) do update set
  team_id = excluded.team_id,
  name = excluded.name,
  role = excluded.role,
  sort_order = excluded.sort_order;

insert into public.dept_projects (
  id, team_id, title, summary, is_highlighted,
  owner_name, start_date, end_date, progress_pct, status_label, sort_order
)
values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
   'PE Delivery Cockpit',
   'Unified view of PE delivery health, risks, and upcoming releases.',
   true, 'Sara Hassan', '2026-03-01', '2026-09-30', 62, 'On track', 0),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
   'Platform Foundations 2.0',
   'Harden shared services and cut onboarding time for consuming teams.',
   true, 'Omar Khalil', '2026-02-15', '2026-11-15', 48, 'On track', 1),
  ('93000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000004',
   'Release Pipeline Unification',
   'Standardize CI/CD across delivery teams with shared gates and observability.',
   true, 'Yasmine Farid', '2026-04-01', '2026-10-31', 35, 'At risk', 2),
  ('93000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000005',
   'Lake SLA Dashboard',
   'Operational dashboard for lake pipeline SLAs and consumer impact.',
   false, 'Karim Adel', '2026-05-01', '2026-12-15', 22, 'In progress', 3)
on conflict (id) do update set
  team_id = excluded.team_id,
  title = excluded.title,
  summary = excluded.summary,
  is_highlighted = excluded.is_highlighted,
  owner_name = excluded.owner_name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  progress_pct = excluded.progress_pct,
  status_label = excluded.status_label,
  sort_order = excluded.sort_order;

insert into public.dept_milestones (id, project_id, title, due_date, is_done, sort_order)
values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
   'MVP cockpit live', '2026-06-30', true, 0),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001',
   'Risk signals wired', '2026-08-15', false, 1),
  ('94000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002',
   'Service catalog v1', '2026-07-01', true, 0),
  ('94000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000003',
   'Pilot pipelines migrated', '2026-08-31', false, 0)
on conflict (id) do update set
  project_id = excluded.project_id,
  title = excluded.title,
  due_date = excluded.due_date,
  is_done = excluded.is_done,
  sort_order = excluded.sort_order;

insert into public.dept_timeline_items (id, label, start_date, end_date, status_label, sort_order)
values
  ('95000000-0000-4000-8000-000000000001', 'Q2 foundation hardening',
   '2026-04-01', '2026-06-30', 'Complete', 0),
  ('95000000-0000-4000-8000-000000000002', 'Q3 delivery cockpit rollout',
   '2026-07-01', '2026-09-30', 'In progress', 1),
  ('95000000-0000-4000-8000-000000000003', 'Q4 pipeline unification',
   '2026-10-01', '2026-12-31', 'Planned', 2)
on conflict (id) do update set
  label = excluded.label,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status_label = excluded.status_label,
  sort_order = excluded.sort_order;

