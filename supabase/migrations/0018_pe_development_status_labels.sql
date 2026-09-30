-- PE Development status labels:
-- Planning (as-is), In Progress (Development + RFT + FUT + Review),
-- Done (Live + Closed), Delayed (Pending + On Hold + Open).

do $$
declare
  ws_id uuid;
  source_id uuid;
  target_id uuid;
  merge_row record;
begin
  select id into ws_id
    from public.workspaces
   where slug = 'pe-development';

  if ws_id is null then
    return;
  end if;

  for merge_row in
    select *
      from (
        values
          ('development', 'In Progress', 'active', '#23b123'),
          ('rft', 'In Progress', 'active', '#23b123'),
          ('fut', 'In Progress', 'active', '#23b123'),
          ('review', 'In Progress', 'active', '#23b123'),
          ('live', 'Done', 'completed', '#16a34a'),
          ('closed', 'Done', 'completed', '#16a34a'),
          ('pending', 'Delayed', 'delayed', '#ef4444'),
          ('on hold', 'Delayed', 'delayed', '#ef4444'),
          ('open', 'Delayed', 'delayed', '#ef4444')
      ) as t(source_name, target_name, target_category, target_color)
  loop
    select s.id into source_id
      from public.statuses s
     where s.workspace_id = ws_id
       and lower(btrim(s.name)) = merge_row.source_name;

    if source_id is null then
      continue;
    end if;

    select s.id into target_id
      from public.statuses s
     where s.workspace_id = ws_id
       and lower(btrim(s.name)) = lower(merge_row.target_name);

    if target_id is not null and target_id is distinct from source_id then
      update public.work_items
         set status_id = target_id
       where status_id = source_id;

      delete from public.statuses
       where id = source_id;
    else
      update public.statuses
         set name = merge_row.target_name,
             reporting_category = merge_row.target_category,
             color = merge_row.target_color
       where id = source_id;
    end if;
  end loop;

  update public.statuses
     set reporting_category = 'active',
         color = '#23b123'
   where workspace_id = ws_id
     and lower(btrim(name)) in ('planning', 'in progress');

  update public.statuses
     set reporting_category = 'completed',
         color = '#16a34a'
   where workspace_id = ws_id
     and lower(btrim(name)) = 'done';

  update public.statuses
     set reporting_category = 'delayed',
         color = '#ef4444'
   where workspace_id = ws_id
     and lower(btrim(name)) = 'delayed';
end $$;

-- Preferred order: Planning, In Progress, Done, Delayed
with ws as (
  select id from public.workspaces where slug = 'pe-development'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'pe-development'
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
