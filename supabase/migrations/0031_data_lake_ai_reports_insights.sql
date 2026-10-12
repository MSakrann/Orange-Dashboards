-- Rename Data Lake -> Data Lake and AI, and add Reports and Insights
-- (same Digital-style fields + team tracks + statuses as Data Lake).

update public.workspaces
   set name = 'Data Lake and AI',
       description = 'Data Lake and AI delivery priorities tracked manually by the team.'
 where slug = 'data-lake';

insert into public.workspaces (id, slug, name, description, sort_order)
values (
  '10000000-0000-4000-8000-00000000000d',
  'reports-and-insights',
  'Reports and Insights',
  'Reports and Insights delivery priorities tracked manually by the team.',
  8
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
    '20000000-0000-4000-8000-000000000037',
    '10000000-0000-4000-8000-00000000000d',
    'Planning',
    '#237b4b',
    0,
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000038',
    '10000000-0000-4000-8000-00000000000d',
    'In Progress',
    '#237b4b',
    1,
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000039',
    '10000000-0000-4000-8000-00000000000d',
    'Pending',
    '#f59e0b',
    2,
    'risk'
  ),
  (
    '20000000-0000-4000-8000-00000000003a',
    '10000000-0000-4000-8000-00000000000d',
    'On Hold',
    '#f59e0b',
    3,
    'risk'
  ),
  (
    '20000000-0000-4000-8000-00000000003b',
    '10000000-0000-4000-8000-00000000000d',
    'Testing',
    '#246a91',
    4,
    'active'
  ),
  (
    '20000000-0000-4000-8000-00000000003c',
    '10000000-0000-4000-8000-00000000000d',
    'Done',
    '#16a34a',
    5,
    'completed'
  )
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Preferred order for Reports and Insights statuses.
with ws as (
  select id from public.workspaces where slug = 'reports-and-insights'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'reports-and-insights'
),
ordered as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'planning' then 0
          when 'in progress' then 1
          when 'pending' then 2
          when 'on hold' then 3
          when 'testing' then 4
          when 'done' then 5
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
     where workspace_id = '10000000-0000-4000-8000-00000000000d';
  end if;
end $$;
