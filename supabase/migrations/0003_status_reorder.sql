alter table public.comments
  drop constraint if exists comments_author_name_nonblank;
alter table public.comments
  add constraint comments_author_name_nonblank
  check (length(btrim(author_name)) > 0);

alter table public.comments
  drop constraint if exists comments_body_nonblank;
alter table public.comments
  add constraint comments_body_nonblank
  check (length(btrim(body)) > 0);

alter table public.statuses
  drop constraint if exists statuses_name_nonblank;
alter table public.statuses
  add constraint statuses_name_nonblank
  check (length(btrim(name)) > 0);

alter table public.statuses
  drop constraint if exists statuses_color_hex;
alter table public.statuses
  add constraint statuses_color_hex
  check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.statuses
  drop constraint if exists statuses_workspace_id_sort_order_key;

alter table public.statuses
  add constraint statuses_workspace_id_sort_order_key
  unique (workspace_id, sort_order)
  deferrable initially immediate;

create or replace function public.create_status(
  p_workspace_id uuid,
  p_status_id uuid,
  p_name text,
  p_color text,
  p_reporting_category text
)
returns public.statuses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.statuses;
  v_created public.statuses;
  v_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_id is null or p_status_id is null then
    raise exception 'workspace and status id are required';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'status name is required';
  end if;

  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'status color must be a six-digit hex value';
  end if;

  if p_reporting_category is null
     or p_reporting_category not in ('active', 'risk', 'delayed', 'completed') then
    raise exception 'invalid reporting category';
  end if;

  perform 1
    from public.workspaces
   where id = p_workspace_id
   for update;
  if not found then
    raise exception 'workspace does not exist';
  end if;

  select *
    into v_existing
    from public.statuses
   where id = p_status_id
   for update;

  if found then
    if v_existing.workspace_id = p_workspace_id
       and v_existing.name = btrim(p_name)
       and lower(v_existing.color) = lower(p_color)
       and v_existing.reporting_category = p_reporting_category then
      return v_existing;
    end if;
    raise exception 'status id already exists with different values';
  end if;

  select coalesce(max(sort_order) + 1, 0)
    into v_sort_order
    from public.statuses
   where workspace_id = p_workspace_id;

  insert into public.statuses (
    id,
    workspace_id,
    name,
    color,
    reporting_category,
    sort_order
  )
  values (
    p_status_id,
    p_workspace_id,
    btrim(p_name),
    lower(p_color),
    p_reporting_category,
    v_sort_order
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.create_status(uuid, uuid, text, text, text) from public;
grant execute on function public.create_status(uuid, uuid, text, text, text)
to authenticated, service_role;

create or replace function public.reorder_statuses(
  p_workspace_id uuid,
  p_ordered_status_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_status_count integer;
  v_matched_count integer;
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_id is null or p_ordered_status_ids is null then
    raise exception 'workspace and ordered status ids are required';
  end if;

  if array_position(p_ordered_status_ids, null) is not null then
    raise exception 'ordered status ids cannot contain null';
  end if;

  select cardinality(p_ordered_status_ids), count(distinct status_id)::integer
    into v_input_count, v_distinct_count
    from unnest(p_ordered_status_ids) as requested(status_id);

  if v_input_count <> v_distinct_count then
    raise exception 'ordered status ids cannot contain duplicates';
  end if;

  perform 1
    from public.workspaces
   where id = p_workspace_id
   for update;
  if not found then
    raise exception 'workspace does not exist';
  end if;

  perform 1
    from public.statuses
   where workspace_id = p_workspace_id
   order by id
   for update;

  select count(*)::integer,
         count(*) filter (where id = any(p_ordered_status_ids))::integer
    into v_status_count, v_matched_count
    from public.statuses
   where workspace_id = p_workspace_id;

  if v_input_count <> v_status_count or v_matched_count <> v_status_count then
    raise exception 'ordered status ids must contain all workspace statuses exactly once';
  end if;

  set constraints public.statuses_workspace_id_sort_order_key deferred;

  update public.statuses as status
     set sort_order = requested.ordinality - 1
    from unnest(p_ordered_status_ids) with ordinality
         as requested(status_id, ordinality)
   where status.id = requested.status_id
     and status.workspace_id = p_workspace_id;

  set constraints public.statuses_workspace_id_sort_order_key immediate;
end;
$$;

revoke all on function public.reorder_statuses(uuid, uuid[]) from public;
grant execute on function public.reorder_statuses(uuid, uuid[])
to authenticated, service_role;

drop function if exists public.replace_and_delete_status(uuid, uuid, uuid);

create or replace function public.replace_and_delete_status(
  p_workspace_id uuid,
  p_source_status_id uuid,
  p_replacement_status_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_workspace_id uuid;
  v_replacement_workspace_id uuid;
  v_source_updated_at timestamptz;
  v_status_count integer;
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_id is null
     or p_source_status_id is null
     or p_replacement_status_id is null
     or p_expected_updated_at is null then
    raise exception 'workspace, source status, replacement status, and timestamp are required';
  end if;

  if p_source_status_id = p_replacement_status_id then
    raise exception 'source and replacement statuses must be different';
  end if;

  perform 1
    from public.workspaces
   where id = p_workspace_id
   for update;
  if not found then
    raise exception 'workspace does not exist';
  end if;

  perform 1
    from public.statuses
   where workspace_id = p_workspace_id
   order by id
   for update;

  select count(*)::integer
    into v_status_count
    from public.statuses
   where workspace_id = p_workspace_id;

  if v_status_count <= 1 then
    raise exception 'cannot delete the final status in a workspace';
  end if;

  select workspace_id, updated_at
    into v_source_workspace_id, v_source_updated_at
    from public.statuses
   where id = p_source_status_id;
  if not found then
    raise exception 'source status does not exist';
  end if;

  if v_source_updated_at <> p_expected_updated_at then
    raise exception 'status changed by someone else; refresh and try again'
      using errcode = '40001';
  end if;

  select workspace_id
    into v_replacement_workspace_id
    from public.statuses
   where id = p_replacement_status_id;
  if not found then
    raise exception 'replacement status does not exist';
  end if;

  if v_source_workspace_id <> p_workspace_id
     or v_replacement_workspace_id <> p_workspace_id then
    raise exception 'both statuses must belong to the same requested workspace';
  end if;

  update public.work_items
     set status_id = p_replacement_status_id
   where workspace_id = p_workspace_id
     and status_id = p_source_status_id;

  delete from public.statuses
   where id = p_source_status_id
     and workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.replace_and_delete_status(uuid, uuid, uuid, timestamptz)
from public;
grant execute on function public.replace_and_delete_status(uuid, uuid, uuid, timestamptz)
to authenticated, service_role;

-- Status deletion is intentionally RPC-only so the final-status and
-- same-workspace replacement checks cannot be bypassed with direct DML.
revoke delete on table public.statuses from authenticated;
