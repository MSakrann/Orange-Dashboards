-- Manual Digital dashboard: workspace, statuses, and free-text release tag.

alter table public.work_items
  add column if not exists release_tag text;

alter table public.work_items
  drop constraint if exists work_items_release_tag_length_check;

alter table public.work_items
  add constraint work_items_release_tag_length_check
  check (release_tag is null or char_length(release_tag) <= 100);

insert into public.workspaces (id, slug, name, description, sort_order)
values (
  '10000000-0000-4000-8000-00000000000b',
  'digital',
  'Digital',
  'Digital delivery priorities tracked manually by the team.',
  6
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
    '20000000-0000-4000-8000-00000000002d',
    '10000000-0000-4000-8000-00000000000b',
    'In Progress',
    '#237b4b',
    0,
    'active'
  ),
  (
    '20000000-0000-4000-8000-00000000002e',
    '10000000-0000-4000-8000-00000000000b',
    'Pending',
    '#f59e0b',
    1,
    'risk'
  ),
  (
    '20000000-0000-4000-8000-00000000002f',
    '10000000-0000-4000-8000-00000000000b',
    'Cancelled',
    '#64748b',
    2,
    'delayed'
  ),
  (
    '20000000-0000-4000-8000-000000000030',
    '10000000-0000-4000-8000-00000000000b',
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

-- Preferred order for Digital statuses.
with ws as (
  select id from public.workspaces where slug = 'digital'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'digital'
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

-- Ensure Digital is not Jira-linked when the Jira settings table exists.
do $$
begin
  if to_regclass('public.workspace_jira_settings') is not null then
    delete from public.workspace_jira_settings
     where workspace_id = '10000000-0000-4000-8000-00000000000b';
  end if;
end $$;
