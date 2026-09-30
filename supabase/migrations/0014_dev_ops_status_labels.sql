-- Keep Dev Ops workspace title and rename mirrored status labels.
-- Jira still sends "To Do" / "In Review"; dashboard shows Planning / Delayed.

update public.workspaces
   set name = 'Dev Ops'
 where slug = 'development-operations'
   and name is distinct from 'Dev Ops';

-- To Do -> Planning
update public.statuses s
   set name = 'Planning'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'development-operations'
   and lower(btrim(s.name)) = 'to do';

-- In Review -> Delayed (merge onto existing Delayed when both exist)
with ws as (
  select id from public.workspaces where slug = 'development-operations'
),
review as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'in review'
),
delayed as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'delayed'
)
update public.work_items wi
   set status_id = delayed.id
  from review, delayed
 where wi.status_id = review.id
   and review.id is distinct from delayed.id;

with ws as (
  select id from public.workspaces where slug = 'development-operations'
),
review as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'in review'
),
delayed as (
  select s.id
    from public.statuses s
    join ws on ws.id = s.workspace_id
   where lower(btrim(s.name)) = 'delayed'
)
delete from public.statuses s
 using review, delayed
 where s.id = review.id
   and review.id is distinct from delayed.id;

update public.statuses s
   set name = 'Delayed'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'development-operations'
   and lower(btrim(s.name)) = 'in review';
