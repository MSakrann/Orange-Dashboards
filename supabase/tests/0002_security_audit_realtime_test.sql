begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

select set_eq(
  $$
    select relname::text
      from pg_class
     where relnamespace = 'public'::regnamespace
       and relkind = 'r'
       and relrowsecurity
  $$,
  $$
    values
      ('admin_users'),
      ('workspaces'),
      ('statuses'),
      ('work_items'),
      ('comments'),
      ('activity_history')
  $$,
  'RLS is enabled on every application table'
);

select is(
  (
    select count(*)::integer
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename in ('workspaces', 'statuses', 'work_items', 'comments')
  ),
  4,
  'the realtime publication includes every public dashboard table'
);

select is(
  (
    select count(*)::integer
      from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('workspaces', 'statuses', 'work_items', 'comments')
       and relreplident = 'f'
  ),
  4,
  'realtime tables use replica identity full'
);

select is(
  (
    select count(*)::integer
      from pg_trigger
     where tgname = 'audit_dashboard_mutation'
       and tgrelid in (
         'public.workspaces'::regclass,
         'public.statuses'::regclass,
         'public.work_items'::regclass,
         'public.comments'::regclass
       )
  ),
  4,
  'all mutable dashboard entities have audit triggers'
);

select ok(
  exists (
    select 1
      from pg_trigger trigger_record
      join pg_proc membership_lock
        on membership_lock.oid = trigger_record.tgfoid
     where trigger_record.tgrelid = 'public.work_items'::regclass
       and trigger_record.tgname = 'lock_work_item_root_membership'
       and pg_get_triggerdef(trigger_record.oid)
         ilike '%BEFORE INSERT OR DELETE OR UPDATE OF parent_id, workspace_id%'
       and regexp_replace(membership_lock.prosrc, '\s+', ' ', 'g')
         ~* 'from public\.workspaces .* order by id .* for update'
  ),
  'root membership changes lock workspace tuples in stable order'
);

select ok(
  (
    select regexp_replace(prosrc, '\s+', ' ', 'g') ~*
      'from public\.work_items .* order by id .* for update .* from public\.workspaces .* for update .* select count\(\*\)::integer'
       and prosrc ilike '%sibling membership changed during reorder%'
      from pg_proc
     where oid = 'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure
  ),
  'reorder locks item tuples before workspace and then revalidates membership'
);

select ok(
  (
    select regexp_replace(prosrc, '\s+', ' ', 'g')
             ~* 'order by id .* for update nowait .* from public\.workspaces .* where id = p_workspace_id .* for update nowait .* exception .* when lock_not_available'
       and prosrc ilike '%when lock_not_available%'
       and lower(prosrc) like '%errcode = ''55p03''%'
       and prosrc ilike '%retry with a fresh sibling list%'
       and prosrc not ilike '%when others%'
      from pg_proc
     where oid = 'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure
  ),
  'reorder fails fast on tuple contention with retryable lock semantics'
);

select ok(
  (
    select prosrc ilike '%old.parent_id is distinct from new.parent_id%'
       and prosrc ilike '%max(sort_order) + 1%'
      from pg_proc
     where oid = 'public.lock_work_item_root_membership()'::regprocedure
  ),
  'items joining a sibling set receive a collision-free appended position'
);

select has_function(
  'public',
  'is_admin',
  array[]::text[],
  'the reusable admin predicate exists'
);

select function_returns(
  'public',
  'is_admin',
  array[]::text[],
  'boolean',
  'the admin predicate returns boolean'
);

select ok(
  (
    select prosecdef
      from pg_proc
     where oid = 'public.is_admin()'::regprocedure
  ),
  'the admin predicate is security definer'
);

select is(
  (
    select 'search_path=""' = any(coalesce(proconfig, array[]::text[]))
      from pg_proc
     where oid = 'public.is_admin()'::regprocedure
  ),
  true,
  'the admin predicate has an empty search path'
);

select has_function(
  'public',
  'reorder_work_items',
  array['uuid', 'uuid', 'uuid[]'],
  'the reorder RPC exists'
);

select ok(
  (
    select prosecdef
      from pg_proc
     where oid = 'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure
  ),
  'the reorder RPC is security definer'
);

select is(
  (
    select 'search_path=""' = any(coalesce(proconfig, array[]::text[]))
      from pg_proc
     where oid = 'public.reorder_work_items(uuid,uuid,uuid[])'::regprocedure
  ),
  true,
  'the reorder RPC has an empty search path'
);

select has_function(
  'public',
  'replace_and_delete_status',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone'],
  'the status replacement RPC exists'
);

select ok(
  (
    select prosecdef
      from pg_proc
     where oid =
       'public.replace_and_delete_status(uuid,uuid,uuid,timestamptz)'::regprocedure
  ),
  'the status replacement RPC is security definer'
);

select is(
  (
    select 'search_path=""' = any(coalesce(proconfig, array[]::text[]))
      from pg_proc
     where oid =
       'public.replace_and_delete_status(uuid,uuid,uuid,timestamptz)'::regprocedure
  ),
  true,
  'the status replacement RPC has an empty search path'
);

select is(
  (
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename = 'activity_history'
       and cmd = 'SELECT'
  ),
  1,
  'history has one admin select policy'
);

select is(
  (
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename = 'activity_history'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'history has no direct mutation policies'
);

create schema task3_test_helpers;

create function task3_test_helpers.set_subject(subject_id uuid)
returns text
language sql
set search_path = ''
as $$
  select set_config(
    'request.jwt.claim.sub',
    coalesce(subject_id::text, ''),
    true
  )
$$;

grant usage on schema extensions to anon, authenticated;
grant execute on all functions in schema extensions to anon, authenticated;
grant usage on schema task3_test_helpers to anon, authenticated;
grant execute on function task3_test_helpers.set_subject(uuid) to anon, authenticated;

insert into auth.users (id)
values
  ('90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.admin_users (auth_user_id, email, display_name)
values (
  '90000000-0000-4000-8000-000000000001',
  'task3-admin@example.test',
  'Task 3 Admin'
)
on conflict (auth_user_id) do update
set email = excluded.email,
    display_name = excluded.display_name;

insert into public.workspaces (id, slug, name, sort_order)
values (
  '91000000-0000-4000-8000-000000000001',
  'task3-pgtap',
  'Task 3 pgTAP',
  900
);

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Current',
    '#111111',
    0,
    'active'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000001',
    'Unused',
    '#222222',
    1,
    'risk'
  );

insert into public.work_items (
  id, workspace_id, title, status_id, sort_order
)
values (
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Original title',
  '92000000-0000-4000-8000-000000000001',
  0
);

delete from public.activity_history;

select task3_test_helpers.set_subject(null);
set local role anon;

select lives_ok(
  $$ select count(*) from public.workspaces $$,
  'anonymous users can read public dashboard data'
);

select throws_matching(
  $$
    insert into public.workspaces (slug, name, sort_order)
    values ('task3-anon-write', 'Task 3 anon write', 901)
  $$,
  'permission denied|row-level security',
  'anonymous users cannot write dashboard data'
);

reset role;
select task3_test_helpers.set_subject(
  '90000000-0000-4000-8000-000000000002'
);
set local role authenticated;

select is(
  public.is_admin(),
  false,
  'an authenticated non-admin fails the admin predicate'
);

select results_eq(
  $$
    update public.work_items
       set title = 'Non-admin tamper'
     where id = '93000000-0000-4000-8000-000000000001'
    returning id
  $$,
  $$ select null::uuid where false $$,
  'an authenticated non-admin cannot update visible dashboard rows'
);

select is(
  (select count(*)::bigint from public.activity_history),
  0::bigint,
  'an authenticated non-admin cannot read history'
);

reset role;
select task3_test_helpers.set_subject(
  '90000000-0000-4000-8000-000000000001'
);
set local role authenticated;

select is(public.is_admin(), true, 'the configured admin passes the predicate');

select lives_ok(
  $$
    update public.work_items
       set title = 'Admin update'
     where id = '93000000-0000-4000-8000-000000000001'
  $$,
  'an admin can update dashboard data'
);

select ok(
  (
    select actor_id = '90000000-0000-4000-8000-000000000001'
       and workspace_id = '91000000-0000-4000-8000-000000000001'
       and old_values ->> 'title' = 'Original title'
       and new_values ->> 'title' = 'Admin update'
      from public.activity_history
     where entity_id = '93000000-0000-4000-8000-000000000001'
       and action = 'update'
     order by created_at desc, id desc
     limit 1
  ),
  'the audit trigger records actor, workspace, and old/new values'
);

select throws_matching(
  $$
    insert into public.activity_history (action, entity_type)
    values ('fake', 'work_item')
  $$,
  'permission denied|row-level security',
  'an admin cannot write history directly'
);

select lives_ok(
  $$
    select public.reorder_work_items(
      '91000000-0000-4000-8000-000000000001',
      null,
      array['93000000-0000-4000-8000-000000000001'::uuid]
    )
  $$,
  'the reorder RPC accepts an exact root sibling set for an admin'
);

select throws_matching(
  $$
    select public.reorder_work_items(
      '91000000-0000-4000-8000-000000000001',
      null,
      array[
        '93000000-0000-4000-8000-000000000001'::uuid,
        '93000000-0000-4000-8000-000000000001'::uuid
      ]
    )
  $$,
  'duplicate',
  'the reorder RPC rejects duplicate identifiers'
);

select lives_ok(
  $$
    select public.replace_and_delete_status(
      '91000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002',
      '92000000-0000-4000-8000-000000000001',
      (
        select updated_at
          from public.statuses
         where id = '92000000-0000-4000-8000-000000000002'
      )
    )
  $$,
  'the replacement RPC can delete an unused same-workspace status'
);

select is(
  (
    select count(*)::bigint
      from public.statuses
     where id = '92000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'the replacement RPC deletes the source status'
);

select ok(
  (select count(*) > 0 from public.activity_history),
  'an admin can read generated history'
);

reset role;

select * from finish();
rollback;
