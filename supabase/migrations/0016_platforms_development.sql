-- Rename Platform Development -> Platforms Development and normalize statuses:
-- To Do -> Planning, In Review merged into In Progress, Pending -> Delayed.

update public.workspaces
   set name = 'Platforms Development'
 where slug = 'platform-development'
   and name is distinct from 'Platforms Development';

-- To Do -> Planning
update public.statuses s
   set name = 'Planning'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'platform-development'
   and lower(btrim(s.name)) = 'to do';

-- Pending -> Delayed (merge onto existing Delayed when both exist)
with ws as (
  select id from public.workspaces where slug = 'platform-development'
),
pending as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'pending'
),
delayed as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'delayed'
)
update public.work_items wi
   set status_id = delayed.id
  from pending, delayed
 where wi.status_id = pending.id
   and pending.id is distinct from delayed.id;

with ws as (
  select id from public.workspaces where slug = 'platform-development'
),
pending as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'pending'
),
delayed as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'delayed'
)
delete from public.statuses s
 using pending, delayed
 where s.id = pending.id
   and pending.id is distinct from delayed.id;

update public.statuses s
   set name = 'Delayed',
       reporting_category = 'delayed',
       color = '#ef4444'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'platform-development'
   and lower(btrim(s.name)) = 'pending';

-- In Review -> In Progress (combine)
with ws as (
  select id from public.workspaces where slug = 'platform-development'
),
review as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'in review'
),
progress as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'in progress'
)
update public.work_items wi
   set status_id = progress.id
  from review, progress
 where wi.status_id = review.id
   and review.id is distinct from progress.id;

with ws as (
  select id from public.workspaces where slug = 'platform-development'
),
review as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'in review'
),
progress as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'in progress'
)
delete from public.statuses s
 using review, progress
 where s.id = review.id
   and review.id is distinct from progress.id;

update public.statuses s
   set name = 'In Progress'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'platform-development'
   and lower(btrim(s.name)) = 'in review';

-- Preferred order: Planning, In Progress, Done, Delayed
with ws as (
  select id from public.workspaces where slug = 'platform-development'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'platform-development'
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
