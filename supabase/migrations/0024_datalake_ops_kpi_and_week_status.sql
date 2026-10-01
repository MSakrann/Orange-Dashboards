-- Data Lake Ops: rename KPI statuses and add Feeds.
-- Week-status fields (last_week_status / current_status) already exist from 0021.

with ws as (
  select id from public.workspaces where slug = 'datalake-ops'
),
ranked as (
  select
    s.id,
    row_number() over (order by s.sort_order, s.name) as rn
  from public.statuses s
  join ws on ws.id = s.workspace_id
)
update public.statuses s
   set name = case ranked.rn
         when 1 then 'Data Ingestion'
         when 2 then 'DAG Monitoring'
         when 3 then 'Segmentation Files'
         when 4 then 'Reporting Delivery'
         when 5 then 'Feeds'
         else s.name
       end,
       reporting_category = 'active',
       color = case ranked.rn
         when 1 then '#e56f18'
         when 2 then '#246a91'
         when 3 then '#237b4b'
         when 4 then '#a94806'
         when 5 then '#0e7490'
         else s.color
       end,
       sort_order = ranked.rn - 1
  from ranked
 where s.id = ranked.id
   and ranked.rn <= 5;

-- Ensure Feeds exists (idempotent). Use a temporary high sort_order first.
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
  '20000000-0000-4000-8000-00000000002b',
  w.id,
  'Feeds',
  '#0e7490',
  2004,
  'active'
from public.workspaces w
where w.slug = 'datalake-ops'
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Preferred order
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
