-- PE Ops: rename KPI statuses to Promos / PE Platform / Plot / Connect,
-- and add Active/Impacted week-status fields for cards (replacing date display).

alter table public.work_items
  add column if not exists last_week_status text
    check (last_week_status is null or last_week_status in ('Active', 'Impacted')),
  add column if not exists current_status text
    check (current_status is null or current_status in ('Active', 'Impacted'));

with ws as (
  select id from public.workspaces where slug = 'pe-ops'
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
         when 1 then 'Promos'
         when 2 then 'PE Platform'
         when 3 then 'Plot'
         when 4 then 'Connect'
         else s.name
       end,
       reporting_category = 'active',
       color = case ranked.rn
         when 1 then '#e56f18'
         when 2 then '#246a91'
         when 3 then '#237b4b'
         when 4 then '#a94806'
         else s.color
       end,
       sort_order = ranked.rn - 1
  from ranked
 where s.id = ranked.id
   and ranked.rn <= 4;

-- Ensure preferred order even if fewer/more rows exist.
with ws as (
  select id from public.workspaces where slug = 'pe-ops'
)
update public.statuses s
   set sort_order = s.sort_order + 1000
  from ws
 where s.workspace_id = ws.id;

with ws as (
  select id from public.workspaces where slug = 'pe-ops'
),
ordered as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'promos' then 0
          when 'pe platform' then 1
          when 'plot' then 2
          when 'connect' then 3
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
