-- Data Lake: rename Live -> Done and add On Hold.

update public.statuses s
   set name = 'Done',
       color = '#16a34a',
       reporting_category = 'completed'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'data-lake'
   and lower(btrim(s.name)) = 'live';

-- Free sort_order slots before inserting On Hold.
with ws as (
  select id from public.workspaces where slug = 'data-lake'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
select
  '20000000-0000-4000-8000-000000000035',
  w.id,
  'On Hold',
  '#f59e0b',
  2002,
  'risk'
from public.workspaces w
where w.slug = 'data-lake'
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Preferred order: In Progress, Pending, On Hold, Cancelled, Done
with ws as (
  select id from public.workspaces where slug = 'data-lake'
),
ordered as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'in progress' then 0
          when 'pending' then 1
          when 'on hold' then 2
          when 'cancelled' then 3
          when 'done' then 4
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
