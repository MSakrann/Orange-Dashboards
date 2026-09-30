-- Add On Hold status/KPI to the manual PE Development workspace (pe-delivery).

-- Free sort slots before inserting On Hold between In Progress and Done.
update public.statuses s
   set sort_order = s.sort_order + 1000
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'pe-delivery';

with ws as (
  select id from public.workspaces where slug = 'pe-delivery'
),
ranked as (
  select
    s.id,
    case lower(btrim(s.name))
      when 'planning' then 0
      when 'in progress' then 1
      when 'on hold' then 2
      when 'done' then 3
      when 'delayed' then 4
      else 100 + s.sort_order
    end as next_sort
  from public.statuses s
  join ws on ws.id = s.workspace_id
)
update public.statuses s
   set sort_order = ranked.next_sort
  from ranked
 where s.id = ranked.id;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
select
  '20000000-0000-4000-8000-000000000029',
  w.id,
  'On Hold',
  '#f59e0b',
  2,
  'risk'
from public.workspaces w
where w.slug = 'pe-delivery'
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Re-apply preferred order after insert.
with ws as (
  select id from public.workspaces where slug = 'pe-delivery'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'pe-delivery'
),
ranked as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'planning' then 0
          when 'in progress' then 1
          when 'on hold' then 2
          when 'done' then 3
          when 'delayed' then 4
          else 100 + s.sort_order
        end,
        s.name
    ) - 1 as next_sort
  from public.statuses s
  join ws on ws.id = s.workspace_id
)
update public.statuses s
   set sort_order = ranked.next_sort
  from ranked
 where s.id = ranked.id;
