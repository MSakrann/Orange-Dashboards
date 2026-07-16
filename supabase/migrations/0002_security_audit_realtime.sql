-- Reusable, recursion-safe authorization predicate. The function owner bypasses
-- RLS on admin_users, so policies can call this without recursively evaluating
-- a policy on that table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_users
     where auth_user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

alter table public.admin_users enable row level security;
alter table public.workspaces enable row level security;
alter table public.statuses enable row level security;
alter table public.work_items enable row level security;
alter table public.comments enable row level security;
alter table public.activity_history enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.activity_history from anon, authenticated;

grant select on table
  public.workspaces,
  public.statuses,
  public.work_items,
  public.comments
to anon, authenticated;

grant insert, update, delete on table
  public.workspaces,
  public.statuses,
  public.work_items,
  public.comments
to authenticated;

grant select on table public.activity_history to authenticated;
grant all on table
  public.admin_users,
  public.workspaces,
  public.statuses,
  public.work_items,
  public.comments,
  public.activity_history
to service_role;

drop policy if exists workspaces_public_read on public.workspaces;
drop policy if exists statuses_public_read on public.statuses;
drop policy if exists work_items_public_read on public.work_items;
drop policy if exists comments_public_read on public.comments;
drop policy if exists workspaces_admin_insert on public.workspaces;
drop policy if exists workspaces_admin_update on public.workspaces;
drop policy if exists workspaces_admin_delete on public.workspaces;
drop policy if exists statuses_admin_insert on public.statuses;
drop policy if exists statuses_admin_update on public.statuses;
drop policy if exists statuses_admin_delete on public.statuses;
drop policy if exists work_items_admin_insert on public.work_items;
drop policy if exists work_items_admin_update on public.work_items;
drop policy if exists work_items_admin_delete on public.work_items;
drop policy if exists comments_admin_insert on public.comments;
drop policy if exists comments_admin_update on public.comments;
drop policy if exists comments_admin_delete on public.comments;
drop policy if exists activity_history_admin_read on public.activity_history;

create policy workspaces_public_read
on public.workspaces
for select
to anon, authenticated
using (true);

create policy statuses_public_read
on public.statuses
for select
to anon, authenticated
using (true);

create policy work_items_public_read
on public.work_items
for select
to anon, authenticated
using (true);

create policy comments_public_read
on public.comments
for select
to anon, authenticated
using (true);

create policy workspaces_admin_insert
on public.workspaces
for insert
to authenticated
with check ((select public.is_admin()));

create policy workspaces_admin_update
on public.workspaces
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy workspaces_admin_delete
on public.workspaces
for delete
to authenticated
using ((select public.is_admin()));

create policy statuses_admin_insert
on public.statuses
for insert
to authenticated
with check ((select public.is_admin()));

create policy statuses_admin_update
on public.statuses
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy statuses_admin_delete
on public.statuses
for delete
to authenticated
using ((select public.is_admin()));

create policy work_items_admin_insert
on public.work_items
for insert
to authenticated
with check ((select public.is_admin()));

create policy work_items_admin_update
on public.work_items
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy work_items_admin_delete
on public.work_items
for delete
to authenticated
using ((select public.is_admin()));

create policy comments_admin_insert
on public.comments
for insert
to authenticated
with check ((select public.is_admin()));

create policy comments_admin_update
on public.comments
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy comments_admin_delete
on public.comments
for delete
to authenticated
using ((select public.is_admin()));

create policy activity_history_admin_read
on public.activity_history
for select
to authenticated
using ((select public.is_admin()));

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
    now()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.audit_dashboard_mutation() from public;

-- Delete comments while their parent row is still visible. The existing
-- cascading foreign key then becomes a no-op, and comment audit rows retain
-- workspace context even when a work item or workspace is deleted.
create or replace function public.delete_work_item_comments_for_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.comments where work_item_id = old.id;
  return old;
end;
$$;

revoke all on function public.delete_work_item_comments_for_audit() from public;

-- Serialize every operation that can add to or remove from a root sibling set
-- on the same workspace tuple used by reorder_work_items. When a workspace is
-- changed, lock both tuples in UUID order so concurrent moves cannot reverse
-- the lock order.
create or replace function public.lock_work_item_root_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_workspace_id uuid;
  v_new_workspace_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_workspace_id := old.workspace_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_workspace_id := new.workspace_id;
  end if;

  perform 1
    from public.workspaces
   where id in (v_old_workspace_id, v_new_workspace_id)
   order by id
   for update;

  if tg_op = 'INSERT'
     or (
       tg_op = 'UPDATE'
       and (
         old.workspace_id is distinct from new.workspace_id
         or old.parent_id is distinct from new.parent_id
       )
     ) then
    select coalesce(max(sort_order) + 1, 0)
      into new.sort_order
      from public.work_items
     where workspace_id = new.workspace_id
       and parent_id is not distinct from new.parent_id
       and id <> new.id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_work_item_root_membership() from public;

drop trigger if exists delete_comments_before_work_item on public.work_items;
drop trigger if exists lock_work_item_root_membership on public.work_items;
drop trigger if exists audit_dashboard_mutation on public.workspaces;
drop trigger if exists audit_dashboard_mutation on public.statuses;
drop trigger if exists audit_dashboard_mutation on public.work_items;
drop trigger if exists audit_dashboard_mutation on public.comments;

create trigger delete_comments_before_work_item
before delete on public.work_items
for each row execute function public.delete_work_item_comments_for_audit();

create trigger lock_work_item_root_membership
before insert or delete or update of parent_id, workspace_id
on public.work_items
for each row execute function public.lock_work_item_root_membership();

create trigger audit_dashboard_mutation
after insert or update or delete on public.workspaces
for each row execute function public.audit_dashboard_mutation();

create trigger audit_dashboard_mutation
after insert or update or delete on public.statuses
for each row execute function public.audit_dashboard_mutation();

create trigger audit_dashboard_mutation
after insert or update or delete on public.work_items
for each row execute function public.audit_dashboard_mutation();

create trigger audit_dashboard_mutation
after insert or update or delete on public.comments
for each row execute function public.audit_dashboard_mutation();

-- Deferring this constraint lets reorder_work_items update every sibling once,
-- avoiding transient uniqueness conflicts and noisy intermediate audit rows.
alter table public.work_items
  drop constraint if exists work_items_workspace_id_parent_id_sort_order_key;

alter table public.work_items
  add constraint work_items_workspace_id_parent_id_sort_order_key
  unique nulls not distinct (workspace_id, parent_id, sort_order)
  deferrable initially immediate;

create or replace function public.reorder_work_items(
  p_workspace_id uuid,
  p_parent_id uuid,
  p_ordered_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_sibling_count integer;
  v_matched_count integer;
  v_parent_workspace_id uuid;
  v_parent_parent_id uuid;
  v_locked_item_ids uuid[];
  v_prelocked_sibling_ids uuid[];
  v_postlock_sibling_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace is required';
  end if;

  if p_ordered_item_ids is null then
    raise exception 'ordered item ids are required';
  end if;

  if array_position(p_ordered_item_ids, null) is not null then
    raise exception 'ordered item ids cannot contain null';
  end if;

  select cardinality(p_ordered_item_ids),
         count(distinct item_id)::integer
    into v_input_count, v_distinct_count
    from unnest(p_ordered_item_ids) as requested(item_id);

  if v_input_count <> v_distinct_count then
    raise exception 'ordered item ids cannot contain duplicates';
  end if;

  -- Membership-changing UPDATE/DELETE statements already hold their item row
  -- before their trigger waits on the workspace. Lock the current sibling set
  -- (and parent, for child reorders) in UUID order before taking that same
  -- workspace lock, preventing a row/workspace lock inversion.
  begin
    select coalesce(
             array_agg(locked_item.id order by locked_item.id),
             array[]::uuid[]
           )
      into v_locked_item_ids
      from (
        select id
          from public.work_items
         where (
                 workspace_id = p_workspace_id
                 and parent_id is not distinct from p_parent_id
               )
            or (p_parent_id is not null and id = p_parent_id)
         order by id
         for update nowait
      ) as locked_item;

    perform 1
      from public.workspaces
     where id = p_workspace_id
     for update nowait;

    if not found then
      raise exception 'workspace does not exist';
    end if;
  exception
    when lock_not_available then
      raise exception
        'work item reorder is busy; retry with a fresh sibling list'
        using errcode = '55P03';
  end;

  if p_parent_id is null then
    v_prelocked_sibling_ids := v_locked_item_ids;
  else
    select coalesce(array_agg(item_id order by item_id), array[]::uuid[])
      into v_prelocked_sibling_ids
      from unnest(v_locked_item_ids) as locked(item_id)
     where item_id <> p_parent_id;
  end if;

  if p_parent_id is not null then
    if not (p_parent_id = any(v_locked_item_ids)) then
      raise exception 'parent work item does not exist or changed during reorder';
    end if;

    select workspace_id, parent_id
      into v_parent_workspace_id, v_parent_parent_id
      from public.work_items
     where id = p_parent_id;

    if not found then
      raise exception 'parent work item changed during reorder';
    end if;

    if v_parent_workspace_id <> p_workspace_id then
      raise exception 'parent work item must belong to the requested workspace';
    end if;

    if v_parent_parent_id is not null then
      raise exception 'parent work item must be a project';
    end if;
  end if;

  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_postlock_sibling_ids
    from public.work_items
   where workspace_id = p_workspace_id
     and parent_id is not distinct from p_parent_id;

  if v_postlock_sibling_ids <> v_prelocked_sibling_ids then
    raise exception 'sibling membership changed during reorder; retry with a fresh list';
  end if;

  select count(*)::integer,
         count(*) filter (where id = any(p_ordered_item_ids))::integer
    into v_sibling_count, v_matched_count
    from public.work_items
   where workspace_id = p_workspace_id
     and parent_id is not distinct from p_parent_id;

  if v_input_count <> v_sibling_count or v_matched_count <> v_sibling_count then
    raise exception 'ordered item ids must contain all sibling work items exactly once';
  end if;

  set constraints public.work_items_workspace_id_parent_id_sort_order_key deferred;

  update public.work_items as work_item
     set sort_order = requested.ordinality - 1
    from unnest(p_ordered_item_ids) with ordinality
         as requested(item_id, ordinality)
   where work_item.id = requested.item_id;

  set constraints public.work_items_workspace_id_parent_id_sort_order_key immediate;
end;
$$;

revoke all on function public.reorder_work_items(uuid, uuid, uuid[]) from public;
grant execute on function public.reorder_work_items(uuid, uuid, uuid[])
to authenticated, service_role;

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
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_workspace_id is null
     or p_source_status_id is null
     or p_replacement_status_id is null then
    raise exception 'workspace, source status, and replacement status are required';
  end if;

  if p_source_status_id = p_replacement_status_id then
    raise exception 'source and replacement statuses must be different';
  end if;

  select workspace_id
    into v_source_workspace_id
    from public.statuses
   where id = p_source_status_id
   for update;

  if not found then
    raise exception 'source status does not exist';
  end if;

  select workspace_id
    into v_replacement_workspace_id
    from public.statuses
   where id = p_replacement_status_id
   for update;

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

  delete from public.statuses
   where id = p_source_status_id
     and workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.replace_and_delete_status(uuid, uuid, uuid) from public;
grant execute on function public.replace_and_delete_status(uuid, uuid, uuid)
to authenticated, service_role;

alter table public.workspaces replica identity full;
alter table public.statuses replica identity full;
alter table public.work_items replica identity full;
alter table public.comments replica identity full;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'workspaces',
    'statuses',
    'work_items',
    'comments'
  ]
  loop
    if not exists (
      select 1
        from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table %I.%I',
        'public',
        v_table_name
      );
    end if;
  end loop;
end;
$$;
