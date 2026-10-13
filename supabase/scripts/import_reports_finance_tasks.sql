-- Import Finance Dashboard Tasks into Reports and Insights (reports-and-insights).
-- Inserts sheet projects whose titles do not already exist (case-insensitive).
-- Disregards Comments. Dual owners: "Name-Name" / "Name - Name" -> "Name & Name".

with ws as (
  select id from public.workspaces where slug = 'reports-and-insights'
),
status_map as (
  select s.id, lower(btrim(s.name)) as name
    from public.statuses s
    join ws on ws.id = s.workspace_id
),
incoming (
  title, description, priority, status_name, end_date, assignee, sort_key
) as (
  values
  (
    'eKYC Churn',
    'extract the total number of churned dials and flag churned customers through the daily eKYC process with ekyc process daily',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Weam',
    0
  ),  (
    'DSL Monthly Report',
    'generate a monthly report covering DSL New Activations with packages, granted discount, customer code and have double quota or not',
    'medium',
    'Pending',
    '2026-10-18'::date,
    'Weam',
    1
  ),  (
    'Top 20 User',
    'generate a weekly report every BC, shows top 20 users regarding Voice & SMS streams',
    'medium',
    'Pending',
    '2026-10-18'::date,
    'Weam',
    2
  ),  (
    'Data DAs Bundle Renewals',
    'export all data bundle renewal transactions for all DAs with fees',
    'high',
    'In Progress',
    '2026-10-14'::date,
    'Amira',
    3
  ),  (
    'M0 Activation',
    'generate a monthly report covering',
    'high',
    'In Progress',
    '2026-10-14'::date,
    'Aly',
    4
  ),  (
    'Freebees',
    'generate a report with total consumption for specific DAs with their description',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Aly',
    5
  ),  (
    'Transaction for DA#53',
    'retriev all transactions for DA#53 including added units, addition date and cust code',
    'medium',
    'In Progress',
    '2026-10-15'::date,
    'Weam & Amira',
    6
  ),  (
    'Ogold Revenue',
    'extract Ogold base with their bills and open amount with bill cycle monthly',
    'medium',
    'Planning',
    '2026-10-15'::date,
    'Amira',
    7
  ),  (
    'Termination Process eKYC',
    'extract dials , traiff name, billing and IN termination date, last turnover, located flag and their consumption last 30days',
    'high',
    'Planning',
    '2026-10-18'::date,
    'Amira',
    8
  ),  (
    'Base Analysis (CLTV Report)',
    'calculate and analyze customer liftime value based on customer revenue, usage patterns, tenure and churn behaviour to identify high value cutomer and support cutomer retention strategies',
    'high',
    'In Progress',
    '2026-10-14'::date,
    'Amira',
    9
  ),  (
    'Cashback analysis',
    'check behavior of customer that took cash back, get common dials from may to sep to check activity',
    'high',
    'In Progress',
    '2026-10-13'::date,
    'Aly',
    10
  ),  (
    'Data Per Service Identifier SID-111',
    'the top 10 data traffic in terms of IPs/URLs used under service identifier SID111',
    'medium',
    'Planning',
    '2026-10-19'::date,
    'Aly',
    11
  ),  (
    'DWP per dial',
    'total amount of Orange cash services per dial (P2P, P2M)',
    'medium',
    'In Progress',
    '2026-10-14'::date,
    'Aly',
    12
  )
),
to_insert as (
  select
    i.title,
    i.description,
    i.priority,
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
    0, null, end_date, assignee, sort_order
  from to_insert
  order by sort_key
  returning id, status_id, end_date
)
insert into public.work_item_team_tracks (
  work_item_id, team_name, status_id, start_date, end_date, sort_order
)
select id, 'Finance', status_id, null, end_date, 0
from inserted;

-- Sanity: sheet titles still missing after import (expect none).
with ws as (
  select id from public.workspaces where slug = 'reports-and-insights'
),
incoming(title) as (
  values
('eKYC Churn'),('DSL Monthly Report'),('Top 20 User'),('Data DAs Bundle Renewals'),('M0 Activation'),('Freebees'),('Transaction for DA#53'),('Ogold Revenue'),('Termination Process eKYC'),('Base Analysis (CLTV Report)'),('Cashback analysis'),('Data Per Service Identifier SID-111'),('DWP per dial')
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
