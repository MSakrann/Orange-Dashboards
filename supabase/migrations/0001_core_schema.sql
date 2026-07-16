create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sort_order)
);

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null,
  sort_order integer not null check (sort_order >= 0),
  reporting_category text not null
    check (reporting_category in ('active', 'risk', 'delayed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, sort_order)
);

create unique index statuses_workspace_name_ci_key
  on public.statuses (workspace_id, lower(name));
create index statuses_workspace_sort_idx
  on public.statuses (workspace_id, sort_order);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.work_items(id) on delete cascade,
  title text not null,
  description text,
  status_id uuid not null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  progress integer not null default 0 check (progress between 0 and 100),
  start_date date,
  end_date date,
  assignee text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, status_id)
    references public.statuses(workspace_id, id) on delete restrict,
  check (end_date is null or start_date is null or end_date >= start_date),
  unique nulls not distinct (workspace_id, parent_id, sort_order)
);

create index work_items_workspace_parent_sort_idx
  on public.work_items (workspace_id, parent_id, sort_order);
create index work_items_workspace_status_idx
  on public.work_items (workspace_id, status_id);
create index work_items_parent_idx
  on public.work_items (parent_id) where parent_id is not null;

create or replace function public.check_work_item_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_workspace_id uuid;
  grandparent_id uuid;
begin
  if exists (
    select 1
      from public.work_items
     where parent_id = new.id
       and workspace_id <> new.workspace_id
  ) then
    raise exception 'subtasks must belong to the same workspace';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'work item cannot be its own parent';
  end if;

  if exists (
    select 1
      from public.work_items
     where parent_id = new.id
  ) then
    raise exception 'work item with subtasks cannot become a subtask';
  end if;

  select workspace_id, parent_id
    into parent_workspace_id, grandparent_id
    from public.work_items
   where id = new.parent_id;

  if not found then
    raise exception 'parent work item does not exist';
  end if;

  if parent_workspace_id <> new.workspace_id then
    raise exception 'parent work item must belong to the same workspace';
  end if;

  if grandparent_id is not null then
    raise exception 'parent work item must be a project';
  end if;

  return new;
end;
$$;

create trigger validate_work_item_hierarchy
before insert or update of parent_id, workspace_id
on public.work_items
for each row execute function public.check_work_item_hierarchy();

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_work_item_created_idx
  on public.comments (work_item_id, created_at, id);

-- Deliberately no foreign keys to mutable source rows: history must survive deletion.
create table public.activity_history (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  workspace_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index activity_history_workspace_created_idx
  on public.activity_history (workspace_id, created_at desc);
create index activity_history_entity_idx
  on public.activity_history (entity_type, entity_id, created_at desc);
create index activity_history_actor_idx
  on public.activity_history (actor_id, created_at desc);

create trigger set_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger set_statuses_updated_at
before update on public.statuses
for each row execute function public.set_updated_at();

create trigger set_work_items_updated_at
before update on public.work_items
for each row execute function public.set_updated_at();

create trigger set_comments_updated_at
before update on public.comments
for each row execute function public.set_updated_at();
