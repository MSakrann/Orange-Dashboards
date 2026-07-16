alter table public.activity_history
  add column if not exists workspace_slug text,
  add column if not exists workspace_name text;

create table if not exists public.workspace_identity_registry (
  workspace_id uuid primary key,
  slug text not null unique,
  name text not null,
  constraint workspace_identity_registry_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table public.workspace_identity_registry
  drop constraint if exists workspace_identity_registry_slug_format;
alter table public.workspace_identity_registry
  add constraint workspace_identity_registry_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

revoke all on table public.workspace_identity_registry
from public, anon, authenticated;
grant all on table public.workspace_identity_registry to service_role;

update public.activity_history as history
   set workspace_slug = workspace.slug,
       workspace_name = workspace.name
  from public.workspaces as workspace
 where history.workspace_id = workspace.id
   and (
     history.workspace_slug is null
     or history.workspace_name is null
   );

update public.activity_history as history
   set workspace_slug = identity_snapshot.workspace_slug,
       workspace_name = identity_snapshot.workspace_name
  from (
    select distinct on (workspace_id)
           workspace_id,
           coalesce(new_values ->> 'slug', old_values ->> 'slug') as workspace_slug,
           coalesce(new_values ->> 'name', old_values ->> 'name') as workspace_name
      from public.activity_history
     where entity_type = 'workspace'
       and coalesce(new_values ->> 'slug', old_values ->> 'slug') is not null
     order by workspace_id, created_at desc, id desc
  ) as identity_snapshot
 where history.workspace_id = identity_snapshot.workspace_id
   and (
     history.workspace_slug is null
     or history.workspace_name is null
   );

do $$
begin
  if exists (
    with identity_candidates as (
      select id as workspace_id, slug
        from public.workspaces
      union all
      select workspace_id, workspace_slug
        from public.activity_history
       where workspace_id is not null
         and workspace_slug is not null
    )
    select 1
      from identity_candidates
     group by slug
    having count(distinct workspace_id) > 1
  ) then
    raise exception 'workspace slug was reused by multiple workspace identities';
  end if;

  if exists (
    with identity_candidates as (
      select id as workspace_id, slug
        from public.workspaces
      union all
      select workspace_id, workspace_slug
        from public.activity_history
       where workspace_id is not null
         and workspace_slug is not null
    )
    select 1
      from identity_candidates
     group by workspace_id
    having count(distinct slug) > 1
  ) then
    raise exception 'workspace slug changes are not supported';
  end if;

  if exists (
    with identity_candidates as (
      select id as workspace_id, slug
        from public.workspaces
      union all
      select workspace_id, workspace_slug
        from public.activity_history
       where workspace_id is not null
         and workspace_slug is not null
    )
    select 1
      from identity_candidates as candidate
      join public.workspace_identity_registry as registered
        on registered.workspace_id = candidate.workspace_id
        or registered.slug = candidate.slug
     where registered.workspace_id <> candidate.workspace_id
        or registered.slug <> candidate.slug
  ) then
    raise exception 'workspace identity conflicts with the persistent registry';
  end if;
end;
$$;

insert into public.workspace_identity_registry (workspace_id, slug, name)
select distinct on (workspace_id)
       workspace_id,
       workspace_slug,
       workspace_name
  from public.activity_history
 where workspace_id is not null
   and workspace_slug is not null
   and workspace_name is not null
 order by workspace_id, created_at desc, id desc
on conflict (workspace_id) do update
set name = excluded.name
where workspace_identity_registry.slug = excluded.slug;

insert into public.workspace_identity_registry (workspace_id, slug, name)
select id, slug, name
  from public.workspaces
on conflict (workspace_id) do update
set name = excluded.name
where workspace_identity_registry.slug = excluded.slug;

create or replace function public.maintain_workspace_identity_registry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registered_slug text;
  v_registered_workspace_id uuid;
begin
  if tg_op = 'INSERT' then
    select slug
      into v_registered_slug
      from public.workspace_identity_registry
     where workspace_id = new.id;

    if found then
      if v_registered_slug <> new.slug then
        raise exception 'workspace identity cannot be changed';
      end if;
      return new;
    end if;

    select workspace_id
      into v_registered_workspace_id
      from public.workspace_identity_registry
     where slug = new.slug;

    if found and v_registered_workspace_id <> new.id then
      raise exception 'workspace slug is permanently reserved'
        using errcode = '23505';
    end if;

    begin
      insert into public.workspace_identity_registry (workspace_id, slug, name)
      values (new.id, new.slug, new.name);
    exception
      when unique_violation then
        raise exception 'workspace slug is permanently reserved'
          using errcode = '23505';
    end;
    return new;
  end if;

  if old.id is distinct from new.id then
    raise exception 'workspace identity cannot be changed';
  end if;

  if old.slug is distinct from new.slug then
    raise exception 'workspace slug cannot be changed';
  end if;

  update public.workspace_identity_registry
     set name = new.name
   where workspace_id = new.id
     and slug = new.slug;

  if not found then
    raise exception 'workspace identity is not registered';
  end if;

  return new;
end;
$$;

revoke all on function public.maintain_workspace_identity_registry() from public;

drop trigger if exists maintain_workspace_identity_registry on public.workspaces;
create trigger maintain_workspace_identity_registry
before insert or update of id, slug, name on public.workspaces
for each row execute function public.maintain_workspace_identity_registry();

create index if not exists activity_history_workspace_created_id_idx
  on public.activity_history (workspace_id, created_at desc, id desc);
create index if not exists activity_history_workspace_slug_created_id_idx
  on public.activity_history (workspace_slug, created_at desc, id desc);

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
  v_workspace_slug text;
  v_workspace_name text;
  v_entity_type text;
  v_entity_id uuid;
  v_old_values jsonb;
  v_new_values jsonb;
  v_work_item_id uuid;
begin
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
      v_workspace_slug := coalesce(new.slug, old.slug);
      v_workspace_name := coalesce(new.name, old.name);
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

  select registry.slug, registry.name
    into v_workspace_slug, v_workspace_name
    from public.workspace_identity_registry as registry
   where registry.workspace_id = v_workspace_id;

  if not found then
    raise exception 'workspace identity is not registered';
  end if;

  insert into public.activity_history (
    actor_id,
    actor_name,
    workspace_id,
    workspace_slug,
    workspace_name,
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
    v_workspace_slug,
    v_workspace_name,
    lower(tg_op),
    v_entity_type,
    v_entity_id,
    v_old_values,
    v_new_values,
    now()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.audit_dashboard_mutation() from public;

create or replace function public.resolve_history_workspace(p_workspace_slug text)
returns table (
  workspace_id uuid,
  slug text,
  name text,
  is_deleted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_slug is null
     or length(btrim(p_workspace_slug)) = 0
     or length(p_workspace_slug) > 100 then
    raise exception 'valid workspace slug is required';
  end if;

  return query
  select registry.workspace_id,
         registry.slug,
         registry.name,
         not exists (
           select 1
             from public.workspaces as workspace
            where workspace.id = registry.workspace_id
         ) as is_deleted
    from public.workspace_identity_registry as registry
   where registry.slug = p_workspace_slug;
end;
$$;

revoke all on function public.resolve_history_workspace(text) from public;
revoke all on function public.resolve_history_workspace(text) from anon;
grant execute on function public.resolve_history_workspace(text) to authenticated;

drop function if exists public.query_activity_history(
  text, uuid, text, text, date, date, integer, integer
);
drop function if exists public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
);

create function public.query_activity_history(
  p_workspace_slug text,
  p_snapshot_at timestamptz default null,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_display_name text,
  workspace_id uuid,
  workspace_slug text,
  workspace_name text,
  action text,
  entity_type text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz,
  total_count bigint,
  snapshot_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot_at timestamptz := coalesce(p_snapshot_at, statement_timestamp());
  v_workspace_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_slug is null
     or length(btrim(p_workspace_slug)) = 0
     or length(p_workspace_slug) > 100 then
    raise exception 'valid workspace slug is required';
  end if;

  if p_snapshot_at > statement_timestamp() then
    raise exception 'invalid snapshot timestamp';
  end if;

  select registry.workspace_id
    into v_workspace_id
    from public.workspace_identity_registry as registry
   where registry.slug = p_workspace_slug;

  if not found then
    raise exception 'workspace history identity does not exist';
  end if;

  if p_action is not null and p_action not in ('insert', 'update', 'delete') then
    raise exception 'invalid action filter';
  end if;

  if p_entity_type is not null
     and p_entity_type not in ('workspace', 'status', 'work_item', 'comment') then
    raise exception 'invalid entity type filter';
  end if;

  if p_from_date is not null
     and p_to_date is not null
     and (
       p_from_date > p_to_date
       or p_to_date - p_from_date > 366
     ) then
    raise exception 'invalid date range';
  end if;

  if p_page is null or p_page < 1 or p_page > 10000 then
    raise exception 'page must be between 1 and 10000';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;

  return query
  select history.id,
         history.actor_id,
         history.actor_name,
         admin_user.email as actor_email,
         admin_user.display_name as actor_display_name,
         history.workspace_id,
         history.workspace_slug,
         history.workspace_name,
         history.action,
         history.entity_type,
         history.entity_id,
         history.old_values,
         history.new_values,
         history.created_at,
         count(*) over () as total_count,
         v_snapshot_at as snapshot_at
    from public.activity_history as history
    left join public.admin_users as admin_user
      on admin_user.auth_user_id = history.actor_id
   where history.workspace_id = v_workspace_id
     and history.created_at <= v_snapshot_at
     and (p_actor_id is null or history.actor_id = p_actor_id)
     and (p_action is null or history.action = p_action)
     and (p_entity_type is null or history.entity_type = p_entity_type)
     and (
       p_from_date is null
       or history.created_at >= p_from_date::timestamp at time zone 'UTC'
     )
     and (
       p_to_date is null
       or history.created_at < (p_to_date + 1)::timestamp at time zone 'UTC'
     )
   order by history.created_at desc, history.id desc
   limit p_page_size
  offset (p_page - 1) * p_page_size;
end;
$$;

revoke all on table public.activity_history from anon, authenticated;
revoke all on function public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
) from public;
revoke all on function public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
) from anon;
grant execute on function public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
) to authenticated;
