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

create or replace function public.bound_history_actor_text(
  p_value text,
  p_max_length integer
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when char_length(p_value) <= p_max_length then p_value
    else '[Oversized value truncated] '
      || left(p_value, greatest(0, p_max_length - 28))
  end
$$;

revoke all on function public.bound_history_actor_text(text, integer) from public;
revoke all on function public.bound_history_actor_text(text, integer) from anon;
revoke all on function public.bound_history_actor_text(text, integer) from authenticated;

update public.admin_users
   set display_name = 'Admin'
 where nullif(btrim(display_name, E' \t\n\r'), '') is null;

update public.admin_users
   set email = 'missing-' || auth_user_id::text || '@invalid.local'
 where nullif(btrim(email, E' \t\n\r'), '') is null;

update public.admin_users
   set display_name = public.bound_history_actor_text(display_name, 200)
 where char_length(display_name) > 200;

update public.admin_users
   set email = (
     '[Oversized value truncated:' || auth_user_id::text || '] '
     || left(
       email,
       320 - char_length(
         '[Oversized value truncated:' || auth_user_id::text || '] '
       )
     )
   )
 where char_length(email) > 320;

alter table public.admin_users
  drop constraint if exists admin_users_display_name_length;
alter table public.admin_users
  add constraint admin_users_display_name_length
  check (char_length(btrim(display_name, E' \t\n\r')) between 1 and 200);
alter table public.admin_users
  drop constraint if exists admin_users_email_length;
alter table public.admin_users
  add constraint admin_users_email_length
  check (char_length(btrim(email, E' \t\n\r')) between 1 and 320);

alter table public.workspaces drop constraint if exists workspaces_slug_length;
alter table public.workspaces
  add constraint workspaces_slug_length check (char_length(slug) between 1 and 100);
alter table public.workspaces drop constraint if exists workspaces_name_length;
alter table public.workspaces
  add constraint workspaces_name_length check (char_length(name) between 1 and 200);
alter table public.workspaces drop constraint if exists workspaces_description_length;
alter table public.workspaces
  add constraint workspaces_description_length
  check (description is null or char_length(description) <= 10000);

alter table public.workspace_identity_registry
  drop constraint if exists workspace_identity_registry_slug_length;
alter table public.workspace_identity_registry
  add constraint workspace_identity_registry_slug_length
  check (char_length(slug) between 1 and 100);
alter table public.workspace_identity_registry
  drop constraint if exists workspace_identity_registry_name_length;
alter table public.workspace_identity_registry
  add constraint workspace_identity_registry_name_length
  check (char_length(name) between 1 and 200);

alter table public.statuses drop constraint if exists statuses_name_length;
alter table public.statuses
  add constraint statuses_name_length check (char_length(name) between 1 and 200);
alter table public.statuses drop constraint if exists statuses_color_length;
alter table public.statuses
  add constraint statuses_color_length check (char_length(color) between 1 and 50);

alter table public.work_items drop constraint if exists work_items_title_length;
alter table public.work_items
  add constraint work_items_title_length check (char_length(title) between 1 and 200);
alter table public.work_items drop constraint if exists work_items_description_length;
alter table public.work_items
  add constraint work_items_description_length
  check (description is null or char_length(description) <= 10000);
alter table public.work_items drop constraint if exists work_items_priority_length;
alter table public.work_items
  add constraint work_items_priority_length check (char_length(priority) between 1 and 50);
alter table public.work_items drop constraint if exists work_items_assignee_length;
alter table public.work_items
  add constraint work_items_assignee_length
  check (assignee is null or char_length(assignee) <= 200);

alter table public.comments drop constraint if exists comments_author_name_length;
alter table public.comments
  add constraint comments_author_name_length
  check (char_length(author_name) between 1 and 200);
alter table public.comments drop constraint if exists comments_body_length;
alter table public.comments
  add constraint comments_body_length check (char_length(body) between 1 and 10000);

create or replace function public.list_history_actors(p_workspace_slug text)
returns table (
  actor_id uuid,
  display_name text,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
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

  select registry.workspace_id
    into v_workspace_id
    from public.workspace_identity_registry as registry
   where registry.slug = p_workspace_slug;

  if not found then
    raise exception 'workspace history identity does not exist';
  end if;

  return query
  select history.actor_id,
         public.bound_history_actor_text(coalesce(
           max(nullif(btrim(admin_user.display_name, E' \t\n\r'), '')),
           max(nullif(btrim(history.actor_name, E' \t\n\r'), '')),
           max(nullif(btrim(admin_user.email, E' \t\n\r'), '')),
           history.actor_id::text
         ), 200) as display_name,
         public.bound_history_actor_text(
           max(nullif(btrim(admin_user.email, E' \t\n\r'), '')),
           320
         ) as email
    from public.activity_history as history
    left join public.admin_users as admin_user
      on admin_user.auth_user_id = history.actor_id
   where history.workspace_id = v_workspace_id
     and history.actor_id is not null
   group by history.actor_id
   order by display_name, history.actor_id;
end;
$$;

revoke all on function public.list_history_actors(text) from public;
revoke all on function public.list_history_actors(text) from anon;
grant execute on function public.list_history_actors(text) to authenticated;

create or replace function public.query_activity_history(
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
         public.bound_history_actor_text(
           nullif(btrim(history.actor_name, E' \t\n\r'), ''),
           200
         ),
         public.bound_history_actor_text(
           nullif(btrim(admin_user.email, E' \t\n\r'), ''),
           320
         ) as actor_email,
         public.bound_history_actor_text(
           nullif(btrim(admin_user.display_name, E' \t\n\r'), ''),
           200
         ) as actor_display_name,
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

revoke all on function public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
) from public;
revoke all on function public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
) from anon;
grant execute on function public.query_activity_history(
  text, timestamptz, uuid, text, text, date, date, integer, integer
) to authenticated;
