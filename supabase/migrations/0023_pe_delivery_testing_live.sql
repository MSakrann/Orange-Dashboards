-- PE Development (pe-delivery): rename Done -> Testing and add Live.

update public.statuses s
   set name = 'Testing',
       reporting_category = 'active',
       color = '#246a91'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'pe-delivery'
   and lower(btrim(s.name)) = 'done';

-- Free sort_order slots before inserting Live.
with ws as (
  select id from public.workspaces where slug = 'pe-delivery'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
select
  '20000000-0000-4000-8000-00000000002a',
  w.id,
  'Live',
  '#16a34a',
  2004,
  'completed'
from public.workspaces w
where w.slug = 'pe-delivery'
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Preferred order: Planning, In Progress, On Hold, Testing, Live, Delayed
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
          when 'testing' then 3
          when 'live' then 4
          when 'delayed' then 5
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
