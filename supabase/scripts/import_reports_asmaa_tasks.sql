-- Reconcile Asmaa Reports & Projects into Reports and Insights (reports-and-insights).
-- Exact title match: fill blank description / Unassigned assignee / null dates; sync team status.
-- No title match: insert project + "Reporting and Analytics" team track.
-- Disregards comments. Priority Mid -> medium. Non-date delivery text ignored.

-- Step 1: fill missing fields on existing projects.
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
    'CVM Focus Review 15-Sep - Churn',
    'KPIs for the base churners and migrations calculated for the last 3 and 6 months',
    'high',
    'In Progress',
    '2026-09-28'::date,
    '2026-11-10'::date,
    'Asmaa Ali',
    0
  ),  (
    'MetaShare Analysis',
    'Analysis of the Decline in Meta Share During September',
    'high',
    'Done',
    '2026-09-29'::date,
    null::date,
    'Asmaa Ali',
    1
  ),  (
    'Churned Dials & Wallet Status',
    'A report designed to streamline workflows for the Orange Cash Termination Process.',
    'medium',
    'In Progress',
    '2026-05-05'::date,
    null::date,
    'Asmaa Ali',
    2
  ),  (
    'QOS Shop Review',
    'Investigating Discrepancies in Shop Revenue and Gas',
    'high',
    'In Progress',
    '2026-06-10'::date,
    null::date,
    'Asmaa Ali',
    3
  ),  (
    'MCA_RBT_Cycles_Revenue',
    'MCA service subscriptions',
    'high',
    'In Progress',
    '2026-05-10'::date,
    '2026-06-10'::date,
    'Rana Hellal',
    4
  ),  (
    'E-Khales',
    'Investigating Discrepancies in Trx from fawry',
    'high',
    'In Progress',
    '2026-06-10'::date,
    null::date,
    'Asmaa Ali',
    5
  ),  (
    'OC Gap',
    'OC Bundle card Gap CVM fields',
    'low',
    'In Progress',
    '2026-05-10'::date,
    '2026-10-13'::date,
    'Rana Hellal',
    6
  ),  (
    'QOS Bills',
    'Quality of Sales on postpaid bills',
    'low',
    'In Progress',
    '2026-09-25'::date,
    null::date,
    'Rana Hellal',
    7
  ),  (
    'QOS Recharge',
    'Quality of Sales on Recharges',
    'low',
    'In Progress',
    null::date,
    null::date,
    'Asmaa Ali',
    8
  ),  (
    'Smart Script',
    'Develop a new report to track smart script info from siebel',
    'medium',
    'On Hold',
    '2026-01-10'::date,
    null::date,
    'Asmaa Ali',
    9
  ),  (
    'MNP Siebel Report',
    'Developing a new report to monitor and assess MNP users on a monthly and month-to-date (MTD) basis.',
    'high',
    'On Hold',
    '2026-07-09'::date,
    null::date,
    'Rana Hellal',
    10
  ),  (
    'Release Suspension',
    'Developing a new report to track monthly suspension and release statuses.',
    'medium',
    'In Progress',
    '2026-07-22'::date,
    null::date,
    'Rana Hellal',
    11
  ),  (
    'Wincash Sales & Stock Dashboard',
    'Developing a new dashboard to track wincash global sales and stock',
    'high',
    'On Hold',
    '2026-02-08'::date,
    null::date,
    'Asmaa Ali',
    12
  ),  (
    'Orange Cash Most used',
    'adding new field to cvm tool to calculate the most used transactions in the last 30 , 60 , 90 days',
    'high',
    'In Progress',
    '2026-06-10'::date,
    '2026-10-13'::date,
    'Rana Hellal',
    13
  ),  (
    'orange_cash_gross_adds_daily',
    'updating the report with new requested fields',
    'high',
    'In Progress',
    '2026-06-10'::date,
    '2026-10-13'::date,
    'Rana Hellal',
    14
  ),  (
    'Prepaid DSL',
    '',
    'low',
    'In Progress',
    null::date,
    null::date,
    'Asmaa Ali',
    15
  ),  (
    'Facebook Campaign Analysis',
    'Analysis of facebook shock and optin campaign',
    'high',
    'In Progress',
    '2026-06-10'::date,
    '2026-10-13'::date,
    'Asmaa Ali',
    16
  ),  (
    'walk in Monthly report',
    'developing a new report to track the wincash sim sales kpis',
    'medium',
    'In Progress',
    '2026-10-10'::date,
    '2026-10-15'::date,
    'Rana Hellal',
    17
  )
),
matched as (
  select
    w.id as work_item_id,
    i.description as sheet_description,
    i.priority as sheet_priority,
    i.start_date as sheet_start_date,
    i.end_date as sheet_end_date,
    i.assignee as sheet_assignee,
    sm.id as sheet_status_id,
    (
      nullif(btrim(w.assignee), '') is null
      or lower(btrim(w.assignee)) = 'unassigned'
    ) as incomplete_owner
  from incoming i
  cross join ws
  join public.work_items w
    on w.workspace_id = ws.id
   and w.parent_id is null
   and lower(btrim(w.title)) = lower(btrim(i.title))
  join status_map sm on sm.name = lower(btrim(i.status_name))
),
updated_items as (
  update public.work_items as w
     set description = case
           when nullif(btrim(w.description), '') is null
             and nullif(btrim(m.sheet_description), '') is not null
           then m.sheet_description
           else w.description
         end,
         assignee = case
           when m.incomplete_owner and m.sheet_assignee is not null
           then m.sheet_assignee
           else w.assignee
         end,
         priority = case
           when m.incomplete_owner and m.sheet_priority is not null
           then m.sheet_priority
           else w.priority
         end,
         start_date = coalesce(w.start_date, m.sheet_start_date),
         end_date = coalesce(w.end_date, m.sheet_end_date)
    from matched m
   where w.id = m.work_item_id
     and (
       (nullif(btrim(w.description), '') is null and nullif(btrim(m.sheet_description), '') is not null)
       or (m.incomplete_owner and m.sheet_assignee is not null)
       or (m.incomplete_owner and m.sheet_priority is not null
           and lower(btrim(w.priority)) is distinct from lower(btrim(m.sheet_priority)))
       or (w.start_date is null and m.sheet_start_date is not null)
       or (w.end_date is null and m.sheet_end_date is not null)
     )
  returning w.id
),
updated_tracks as (
  update public.work_item_team_tracks as t
     set status_id = m.sheet_status_id,
         start_date = coalesce(t.start_date, m.sheet_start_date),
         end_date = coalesce(t.end_date, m.sheet_end_date)
    from matched m
   where t.work_item_id = m.work_item_id
     and lower(btrim(t.team_name)) = lower('Reporting and Analytics')
     and (
       t.status_id is distinct from m.sheet_status_id
       or (t.start_date is null and m.sheet_start_date is not null)
       or (t.end_date is null and m.sheet_end_date is not null)
     )
  returning t.work_item_id
)
insert into public.work_item_team_tracks (
  work_item_id, team_name, status_id, start_date, end_date, sort_order
)
select m.work_item_id, 'Reporting and Analytics', m.sheet_status_id, m.sheet_start_date, m.sheet_end_date, 0
  from matched m
 where not exists (
   select 1 from public.work_item_team_tracks t
    where t.work_item_id = m.work_item_id
      and lower(btrim(t.team_name)) = lower('Reporting and Analytics')
 )
   and (select count(*) from updated_items) >= 0
   and (select count(*) from updated_tracks) >= 0;

-- Step 2: insert projects that still do not exist.
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
    'CVM Focus Review 15-Sep - Churn',
    'KPIs for the base churners and migrations calculated for the last 3 and 6 months',
    'high',
    'In Progress',
    '2026-09-28'::date,
    '2026-11-10'::date,
    'Asmaa Ali',
    0
  ),  (
    'MetaShare Analysis',
    'Analysis of the Decline in Meta Share During September',
    'high',
    'Done',
    '2026-09-29'::date,
    null::date,
    'Asmaa Ali',
    1
  ),  (
    'Churned Dials & Wallet Status',
    'A report designed to streamline workflows for the Orange Cash Termination Process.',
    'medium',
    'In Progress',
    '2026-05-05'::date,
    null::date,
    'Asmaa Ali',
    2
  ),  (
    'QOS Shop Review',
    'Investigating Discrepancies in Shop Revenue and Gas',
    'high',
    'In Progress',
    '2026-06-10'::date,
    null::date,
    'Asmaa Ali',
    3
  ),  (
    'MCA_RBT_Cycles_Revenue',
    'MCA service subscriptions',
    'high',
    'In Progress',
    '2026-05-10'::date,
    '2026-06-10'::date,
    'Rana Hellal',
    4
  ),  (
    'E-Khales',
    'Investigating Discrepancies in Trx from fawry',
    'high',
    'In Progress',
    '2026-06-10'::date,
    null::date,
    'Asmaa Ali',
    5
  ),  (
    'OC Gap',
    'OC Bundle card Gap CVM fields',
    'low',
    'In Progress',
    '2026-05-10'::date,
    '2026-10-13'::date,
    'Rana Hellal',
    6
  ),  (
    'QOS Bills',
    'Quality of Sales on postpaid bills',
    'low',
    'In Progress',
    '2026-09-25'::date,
    null::date,
    'Rana Hellal',
    7
  ),  (
    'QOS Recharge',
    'Quality of Sales on Recharges',
    'low',
    'In Progress',
    null::date,
    null::date,
    'Asmaa Ali',
    8
  ),  (
    'Smart Script',
    'Develop a new report to track smart script info from siebel',
    'medium',
    'On Hold',
    '2026-01-10'::date,
    null::date,
    'Asmaa Ali',
    9
  ),  (
    'MNP Siebel Report',
    'Developing a new report to monitor and assess MNP users on a monthly and month-to-date (MTD) basis.',
    'high',
    'On Hold',
    '2026-07-09'::date,
    null::date,
    'Rana Hellal',
    10
  ),  (
    'Release Suspension',
    'Developing a new report to track monthly suspension and release statuses.',
    'medium',
    'In Progress',
    '2026-07-22'::date,
    null::date,
    'Rana Hellal',
    11
  ),  (
    'Wincash Sales & Stock Dashboard',
    'Developing a new dashboard to track wincash global sales and stock',
    'high',
    'On Hold',
    '2026-02-08'::date,
    null::date,
    'Asmaa Ali',
    12
  ),  (
    'Orange Cash Most used',
    'adding new field to cvm tool to calculate the most used transactions in the last 30 , 60 , 90 days',
    'high',
    'In Progress',
    '2026-06-10'::date,
    '2026-10-13'::date,
    'Rana Hellal',
    13
  ),  (
    'orange_cash_gross_adds_daily',
    'updating the report with new requested fields',
    'high',
    'In Progress',
    '2026-06-10'::date,
    '2026-10-13'::date,
    'Rana Hellal',
    14
  ),  (
    'Prepaid DSL',
    '',
    'low',
    'In Progress',
    null::date,
    null::date,
    'Asmaa Ali',
    15
  ),  (
    'Facebook Campaign Analysis',
    'Analysis of facebook shock and optin campaign',
    'high',
    'In Progress',
    '2026-06-10'::date,
    '2026-10-13'::date,
    'Asmaa Ali',
    16
  ),  (
    'walk in Monthly report',
    'developing a new report to track the wincash sim sales kpis',
    'medium',
    'In Progress',
    '2026-10-10'::date,
    '2026-10-15'::date,
    'Rana Hellal',
    17
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
select id, 'Reporting and Analytics', status_id, start_date, end_date, 0
from inserted;

