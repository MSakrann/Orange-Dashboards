-- Dev Ops status order: Planning, In Progress, Done, Delayed.
-- Other statuses (if any) keep relative order after these four.

with ws as (
  select id from public.workspaces where slug = 'development-operations'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'development-operations'
),
ranked as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'planning' then 0
          when 'in progress' then 1
          when 'done' then 2
          when 'delayed' then 3
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
