-- One-way Jira mirror for selected workspaces.

alter table public.work_items
  add column if not exists sync_source text not null default 'local'
    check (sync_source in ('local', 'jira')),
  add column if not exists jira_issue_id text,
  add column if not exists jira_issue_key text,
  add column if not exists jira_updated_at timestamptz;

create unique index if not exists work_items_workspace_jira_issue_id_key
  on public.work_items (workspace_id, jira_issue_id)
  where jira_issue_id is not null;

create unique index if not exists work_items_workspace_jira_issue_key_key
  on public.work_items (workspace_id, jira_issue_key)
  where jira_issue_key is not null;

create index if not exists work_items_jira_issue_key_idx
  on public.work_items (jira_issue_key)
  where jira_issue_key is not null;

create table if not exists public.workspace_jira_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  last_sync_issue_count integer not null default 0 check (last_sync_issue_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jira_status_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  jira_status_name text not null check (char_length(btrim(jira_status_name)) between 1 and 120),
  status_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, status_id)
    references public.statuses(workspace_id, id) on delete cascade,
  unique (workspace_id, jira_status_name)
);

create index if not exists jira_status_mappings_workspace_idx
  on public.jira_status_mappings (workspace_id);

drop trigger if exists workspace_jira_settings_set_updated_at on public.workspace_jira_settings;
create trigger workspace_jira_settings_set_updated_at
before update on public.workspace_jira_settings
for each row execute function public.set_updated_at();

drop trigger if exists jira_status_mappings_set_updated_at on public.jira_status_mappings;
create trigger jira_status_mappings_set_updated_at
before update on public.jira_status_mappings
for each row execute function public.set_updated_at();

create or replace function public.workspace_jira_enabled(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select enabled
        from public.workspace_jira_settings
       where workspace_id = target_workspace_id
    ),
    false
  );
$$;

revoke all on function public.workspace_jira_enabled(uuid) from public;
grant execute on function public.workspace_jira_enabled(uuid) to anon, authenticated, service_role;

create or replace function public.begin_jira_sync_batch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.jira_sync', 'true', true);
end;
$$;

revoke all on function public.begin_jira_sync_batch() from public;
grant execute on function public.begin_jira_sync_batch() to service_role;

-- Skip audit noise during automated Jira sync batches.
create or replace function public.audit_dashboard_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_old_values jsonb;
  v_new_values jsonb;
  v_work_item_id uuid;
begin
  if coalesce(current_setting('app.jira_sync', true), '') = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select display_name
    into v_actor_name
    from public.admin_users
   where auth_user_id = v_actor_id;

  if tg_op <> 'INSERT' then
    v_old_values := to_jsonb(old);
  end if;

  if tg_op <> 'DELETE' then
    v_new_values := to_jsonb(new);
  end if;

  case tg_table_name
    when 'workspaces' then
      v_entity_type := 'workspace';
      v_entity_id := coalesce(new.id, old.id);
      v_workspace_id := v_entity_id;
    when 'statuses' then
      v_entity_type := 'status';
      v_entity_id := coalesce(new.id, old.id);
      v_workspace_id := coalesce(new.workspace_id, old.workspace_id);
    when 'work_items' then
      v_entity_type := 'work_item';
      v_entity_id := coalesce(new.id, old.id);
      v_workspace_id := coalesce(new.workspace_id, old.workspace_id);
    when 'comments' then
      v_entity_type := 'comment';
      v_entity_id := coalesce(new.id, old.id);
      v_work_item_id := coalesce(new.work_item_id, old.work_item_id);

      select workspace_id
        into v_workspace_id
        from public.work_items
       where id = v_work_item_id;
    else
      raise exception 'unsupported audit table: %', tg_table_name;
  end case;

  insert into public.activity_history (
    actor_id,
    actor_name,
    workspace_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  )
  values (
    v_actor_id,
    v_actor_name,
    v_workspace_id,
    lower(tg_op),
    v_entity_type,
    v_entity_id,
    v_old_values,
    v_new_values,
    clock_timestamp()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter table public.workspace_jira_settings enable row level security;
alter table public.jira_status_mappings enable row level security;

revoke all on table public.workspace_jira_settings from anon, authenticated;
revoke all on table public.jira_status_mappings from anon, authenticated;

grant select on table public.workspace_jira_settings to anon, authenticated;
grant select on table public.jira_status_mappings to anon, authenticated;

drop policy if exists workspace_jira_settings_public_read on public.workspace_jira_settings;
create policy workspace_jira_settings_public_read
on public.workspace_jira_settings
for select
to anon, authenticated
using (true);

drop policy if exists jira_status_mappings_public_read on public.jira_status_mappings;
create policy jira_status_mappings_public_read
on public.jira_status_mappings
for select
to anon, authenticated
using (true);

-- Block manual dashboard mutations on Jira-linked workspaces.
drop policy if exists work_items_admin_insert on public.work_items;
create policy work_items_admin_insert
on public.work_items
for insert
to authenticated
with check (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
);

drop policy if exists work_items_admin_update on public.work_items;
create policy work_items_admin_update
on public.work_items
for update
to authenticated
using (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
)
with check (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
);

drop policy if exists work_items_admin_delete on public.work_items;
create policy work_items_admin_delete
on public.work_items
for delete
to authenticated
using (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
);

drop policy if exists statuses_admin_insert on public.statuses;
create policy statuses_admin_insert
on public.statuses
for insert
to authenticated
with check (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
);

drop policy if exists statuses_admin_update on public.statuses;
create policy statuses_admin_update
on public.statuses
for update
to authenticated
using (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
)
with check (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
);

drop policy if exists statuses_admin_delete on public.statuses;
create policy statuses_admin_delete
on public.statuses
for delete
to authenticated
using (
  (select public.is_admin())
  and not public.workspace_jira_enabled(workspace_id)
);

drop policy if exists comments_admin_insert on public.comments;
create policy comments_admin_insert
on public.comments
for insert
to authenticated
with check (
  (select public.is_admin())
  and not exists (
    select 1
      from public.work_items wi
     where wi.id = work_item_id
       and public.workspace_jira_enabled(wi.workspace_id)
  )
);

drop policy if exists comments_admin_update on public.comments;
create policy comments_admin_update
on public.comments
for update
to authenticated
using (
  (select public.is_admin())
  and not exists (
    select 1
      from public.work_items wi
     where wi.id = work_item_id
       and public.workspace_jira_enabled(wi.workspace_id)
  )
)
with check (
  (select public.is_admin())
  and not exists (
    select 1
      from public.work_items wi
     where wi.id = work_item_id
       and public.workspace_jira_enabled(wi.workspace_id)
  )
);

drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete
on public.comments
for delete
to authenticated
using (
  (select public.is_admin())
  and not exists (
    select 1
      from public.work_items wi
     where wi.id = work_item_id
       and public.workspace_jira_enabled(wi.workspace_id)
  )
);

-- Enable Jira mirror for PE and Platform workspaces.
insert into public.workspace_jira_settings (workspace_id, enabled)
select id, true
  from public.workspaces
 where slug in ('pe-development', 'platform-development')
on conflict (workspace_id) do update
set enabled = excluded.enabled;

-- Default Jira status name mappings (customize per your Jira workflow).
insert into public.jira_status_mappings (workspace_id, jira_status_name, status_id)
select w.id, mapping.jira_status_name, s.id
  from public.workspaces w
 cross join (
   values
     ('To Do', 'Delayed'),
     ('Open', 'Delayed'),
     ('Backlog', 'Delayed'),
     ('In Progress', 'In Progress'),
     ('In Review', 'In Progress'),
     ('Blocked', 'At Risk'),
     ('On Hold', 'At Risk'),
     ('Done', 'Completed'),
     ('Closed', 'Completed'),
     ('Resolved', 'Completed')
 ) as mapping(jira_status_name, dashboard_status_name)
 join public.statuses s
   on s.workspace_id = w.id
  and s.name = mapping.dashboard_status_name
 where w.slug in ('pe-development', 'platform-development')
on conflict (workspace_id, jira_status_name) do update
set status_id = excluded.status_id;
