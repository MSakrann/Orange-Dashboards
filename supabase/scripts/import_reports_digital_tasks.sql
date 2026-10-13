-- Import Digital Ongoing Projects into Reports and Insights (reports-and-insights).
-- Inserts sheet projects whose titles do not already exist (case-insensitive).
-- Disregards Comments. Dual owners: "Name - Name" -> "Name & Name".
-- Priority "TBD" -> medium. Status "Pending on digital team" -> Pending.

with ws as (
  select id from public.workspaces where slug = 'reports-and-insights'
),
status_map as (
  select s.id, lower(btrim(s.name)) as name
    from public.statuses s
    join ws on ws.id = s.workspace_id
),
incoming (
  title, description, priority, status_name, start_date, end_date, assignee, sort_key
) as (
  values
  (
    'eKYC B2B Activations & Data Gathering',
    'Reporting for B2B line activation through the My Orange app using eKYC, along with data gathering for customers who need to update their dial information after being cleansed, also through the app using eKYC.',
    'high',
    'In Progress',
    '2026-08-20'::date,
    '2026-10-15'::date,
    'Nesma Adel',
    0
  ),  (
    'Prepaid DSL Recharges',
    'Reporting for prepaid DSL recharge transactions.',
    'medium',
    'Pending',
    '2026-05-14'::date,
    null::date,
    'Youssef Elkady',
    1
  ),  (
    'Quick Pay',
    'Reporting for the Quick Pay feature in the Orange Cash application, which allows users to save recurring bills, automatically inquire about due bills upon login, and complete payments instantly.',
    'medium',
    'Pending',
    '2026-07-16'::date,
    null::date,
    'Abdelrahman Diab',
    2
  ),  (
    'Tafweela',
    'Reporting for the Tafweela integration with Orange Cash through the My Orange app, covering tolls and fuel payments, balance inquiry, and real-time top-ups using the vehicle sticker or car number.',
    'medium',
    'Pending',
    '2026-08-25'::date,
    null::date,
    'Maya Mohamed Mokhtar',
    3
  ),  (
    'BRGR Integration',
    'Integration between Orange and BRGR to provide eligible Orange PREMIER and OGOLD customers with value vouchers redeemable through the BRGR app and stores.',
    'medium',
    'Pending',
    '2026-06-01'::date,
    null::date,
    'Nour Kamal Mahmoud',
    4
  )
),
to_insert as (
  select
    i.title,
    i.description,
    i.priority,
    i.start_date,
    i.end_date,
    i.assignee,
    i.sort_key,
    ws.id as workspace_id,
    sm.id as status_id,
    coalesce(
      (select max(w.sort_order) from public.work_items w where w.workspace_id = ws.id and w.parent_id is null),
      -1
    ) + row_number() over (order by i.sort_key) as sort_order
  from incoming i
  cross join ws
  join status_map sm on sm.name = lower(btrim(i.status_name))
  where not exists (
    select 1
      from public.work_items w
     where w.workspace_id = ws.id
       and w.parent_id is null
       and lower(btrim(w.title)) = lower(btrim(i.title))
  )
),
inserted as (
  insert into public.work_items (
    workspace_id, parent_id, title, description, status_id, priority,
    progress, start_date, end_date, assignee, sort_order
  )
  select
    workspace_id, null, title, description, status_id, priority,
    0, start_date, end_date, assignee, sort_order
  from to_insert
  order by sort_key
  returning id, status_id, start_date, end_date
)
insert into public.work_item_team_tracks (
  work_item_id, team_name, status_id, start_date, end_date, sort_order
)
select id, 'Digital', status_id, start_date, end_date, 0
from inserted;

-- Sanity: sheet titles still missing after import (expect none).
with ws as (
  select id from public.workspaces where slug = 'reports-and-insights'
),
incoming(title) as (
  values
('eKYC B2B Activations & Data Gathering'),('Prepaid DSL Recharges'),('Quick Pay'),('Tafweela'),('BRGR Integration')
)
select i.title as missing_title
  from incoming i
  cross join ws
 where not exists (
   select 1 from public.work_items w
    where w.workspace_id = ws.id
      and w.parent_id is null
      and lower(btrim(w.title)) = lower(btrim(i.title))
 );
