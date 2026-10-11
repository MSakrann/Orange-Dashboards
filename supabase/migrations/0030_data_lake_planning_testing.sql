-- Data Lake: rename Cancelled -> Planning and add Testing.

update public.statuses s
   set name = 'Planning',
       color = '#237b4b',
       reporting_category = 'active'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'data-lake'
   and lower(btrim(s.name)) = 'cancelled';

-- Free sort_order slots before inserting Testing.
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
  '20000000-0000-4000-8000-000000000036',
  w.id,
  'Testing',
  '#246a91',
  2004,
  'active'
from public.workspaces w
where w.slug = 'data-lake'
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Preferred order: Planning, In Progress, Pending, On Hold, Testing, Done
with ws as (
  select id from public.workspaces where slug = 'data-lake'
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
