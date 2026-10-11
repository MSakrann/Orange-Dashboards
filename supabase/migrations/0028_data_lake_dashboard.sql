-- Manual Data Lake dashboard (Digital-style) with per-team status and dates.

insert into public.workspaces (id, slug, name, description, sort_order)
values (
  '10000000-0000-4000-8000-00000000000c',
  'data-lake',
  'Data Lake',
  'Data Lake delivery priorities tracked manually by the team.',
  7
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
values
  (
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-00000000000c',
    'In Progress',
    '#237b4b',
    0,
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000032',
    '10000000-0000-4000-8000-00000000000c',
    'Pending',
    '#f59e0b',
    1,
    'risk'
  ),
  (
    '20000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-00000000000c',
    'Cancelled',
    '#64748b',
    2,
    'delayed'
  ),
  (
    '20000000-0000-4000-8000-000000000034',
    '10000000-0000-4000-8000-00000000000c',
    'Live',
    '#16a34a',
    3,
    'completed'
  )
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

with ws as (
  select id from public.workspaces where slug = 'data-lake'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'data-lake'
),
ordered as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'in progress' then 0
          when 'pending' then 1
          when 'cancelled' then 2
          when 'live' then 3
          else 100 + s.sort_order
        end,
        s.name
    ) - 1 as next_sort
  from public.statuses s
  join ws on ws.id = s.workspace_id
)
update public.statuses s
   set sort_order = ordered.next_sort
  from ordered
 where s.id = ordered.id;

do $$
begin
  if to_regclass('public.workspace_jira_settings') is not null then
    delete from public.workspace_jira_settings
     where workspace_id = '10000000-0000-4000-8000-00000000000c';
  end if;
end $$;

create table if not exists public.work_item_team_tracks (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  team_name text not null,
  status_id uuid not null references public.statuses(id) on delete restrict,
  start_date date,
  end_date date,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(team_name)) between 1 and 100),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create unique index if not exists work_item_team_tracks_item_team_ci_key
  on public.work_item_team_tracks (work_item_id, lower(btrim(team_name)));

create index if not exists work_item_team_tracks_item_sort_idx
  on public.work_item_team_tracks (work_item_id, sort_order, id);

create index if not exists work_item_team_tracks_status_idx
  on public.work_item_team_tracks (status_id);

create or replace function public.check_work_item_team_track_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_workspace_id uuid;
  status_workspace_id uuid;
begin
  select workspace_id into item_workspace_id
    from public.work_items
   where id = new.work_item_id;

  if not found then
    raise exception 'work item does not exist';
  end if;

  select workspace_id into status_workspace_id
    from public.statuses
   where id = new.status_id;

  if not found then
    raise exception 'status does not exist';
  end if;

  if item_workspace_id <> status_workspace_id then
    raise exception 'team track status must belong to the same workspace as the work item';
  end if;

  new.team_name := btrim(new.team_name);
  return new;
end;
$$;

drop trigger if exists validate_work_item_team_track_workspace on public.work_item_team_tracks;
create trigger validate_work_item_team_track_workspace
before insert or update of work_item_id, status_id, team_name
on public.work_item_team_tracks
for each row execute function public.check_work_item_team_track_workspace();

drop trigger if exists set_work_item_team_tracks_updated_at on public.work_item_team_tracks;
create trigger set_work_item_team_tracks_updated_at
before update on public.work_item_team_tracks
for each row execute function public.set_updated_at();

alter table public.work_item_team_tracks enable row level security;

drop policy if exists work_item_team_tracks_public_read on public.work_item_team_tracks;
create policy work_item_team_tracks_public_read
on public.work_item_team_tracks
for select
to anon, authenticated
using (true);

drop policy if exists work_item_team_tracks_admin_insert on public.work_item_team_tracks;
create policy work_item_team_tracks_admin_insert
on public.work_item_team_tracks
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists work_item_team_tracks_admin_update on public.work_item_team_tracks;
create policy work_item_team_tracks_admin_update
on public.work_item_team_tracks
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists work_item_team_tracks_admin_delete on public.work_item_team_tracks;
create policy work_item_team_tracks_admin_delete
on public.work_item_team_tracks
for delete
to authenticated
using ((select public.is_admin()));

-- Keep team-track statuses in sync when a status is replaced/deleted.
create or replace function public.replace_and_delete_status(
  p_workspace_id uuid,
  p_source_status_id uuid,
  p_replacement_status_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_workspace_id uuid;
  v_replacement_workspace_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;

  if p_source_status_id = p_replacement_status_id then
    raise exception 'replacement status must differ from the source status';
  end if;

  select workspace_id into v_source_workspace_id
    from public.statuses
   where id = p_source_status_id;

  if not found then
    raise exception 'source status does not exist';
  end if;

  select workspace_id into v_replacement_workspace_id
    from public.statuses
   where id = p_replacement_status_id;

  if not found then
    raise exception 'replacement status does not exist';
  end if;

  if v_source_workspace_id <> p_workspace_id
     or v_replacement_workspace_id <> p_workspace_id then
    raise exception 'both statuses must belong to the requested workspace';
  end if;

  update public.work_items
     set status_id = p_replacement_status_id
   where workspace_id = p_workspace_id
     and status_id = p_source_status_id;

  if to_regclass('public.work_item_team_tracks') is not null then
    update public.work_item_team_tracks as track
       set status_id = p_replacement_status_id
      from public.work_items as item
     where track.work_item_id = item.id
       and item.workspace_id = p_workspace_id
       and track.status_id = p_source_status_id;
  end if;

  delete from public.statuses
   where id = p_source_status_id
     and workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.replace_and_delete_status(uuid, uuid, uuid) from public;
grant execute on function public.replace_and_delete_status(uuid, uuid, uuid)
to authenticated, service_role;

alter table public.work_item_team_tracks replica identity full;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
      from pg_catalog.pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'work_item_team_tracks'
  ) then
    execute 'alter publication supabase_realtime add table public.work_item_team_tracks';
  end if;
end $$;
