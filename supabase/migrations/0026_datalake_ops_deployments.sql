-- Data Lake Ops: add Deployments status/KPI after Feeds.

-- Free sort_order slots before insert (unique on workspace_id, sort_order).
with ws as (
  select id from public.workspaces where slug = 'datalake-ops'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
select
  '20000000-0000-4000-8000-00000000002c',
  w.id,
  'Deployments',
  '#475569',
  2005,
  'active'
from public.workspaces w
where w.slug = 'datalake-ops'
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Preferred order: Data Ingestion, DAG Monitoring, Segmentation Files,
-- Reporting Delivery, Feeds, Deployments
with ws as (
  select id from public.workspaces where slug = 'datalake-ops'
),
ordered as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'data ingestion' then 0
          when 'dag monitoring' then 1
          when 'segmentation files' then 2
          when 'reporting delivery' then 3
          when 'feeds' then 4
          when 'deployments' then 5
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
