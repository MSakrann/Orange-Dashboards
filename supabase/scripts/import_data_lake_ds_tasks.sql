-- Reconcile DS Running Projects into Data Lake and AI (data-lake).
-- Exact title match:
--   - fill blank description, Unassigned/blank assignee, null end_date from sheet
--   - if record looked incomplete (Unassigned/blank assignee), also apply sheet priority
--   - upsert DS team track: set status from sheet; fill null end_date
-- No title match: insert project + DS team track
-- Disregards Comments. Dual owners: "Name - Name" -> "Name & Name".
-- Non-date Expected Delivery values are ignored.

-- Step 1: fill missing fields on existing projects.
with ws as (
  select id from public.workspaces where slug = 'data-lake'
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
    'OCR - B2B',
    'Detecting certain dials using OCR in PDF documents that contains list of customer data as images',
    'high',
    'In Progress',
    null::date,
    'Ahmed Kamel',
    0
  ),  (
    'OCR - B2C',
    'Automating the customer dial activation in orange shops using OCR to detect the ID and the contracts and match the data between them and integrating with siebel to send the status of the check',
    'high',
    'In Progress',
    null::date,
    'Youssef Khadragy',
    1
  ),  (
    'CVM Segmentation',
    'Clustering for CVM customers to be easier to group them',
    'medium',
    'In Progress',
    null::date,
    'Laila Tamer',
    2
  ),  (
    'ACA Family Tree',
    'Clustering and resolution of records of Egypt national data like finiding missing records or matching records from different sources of same person',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Mohamed Galal',
    3
  ),  (
    'Finetuning',
    'Finetuning our Speech to text model to be used in the digital customer care calls',
    'medium',
    'In Progress',
    null::date,
    'Nariman',
    4
  ),  (
    'Smart Capex',
    'Taking CAPEX decisions across the network',
    'low',
    'On Hold',
    null::date,
    'Youssef Khadragy',
    5
  ),  (
    'Multisim detection revamp',
    'Revamping the multisim resolution through AI',
    'low',
    'On Hold',
    null::date,
    'Mohamed Galal',
    6
  ),  (
    'Speech customization',
    'Adding more features for the transcriptions and summaries of the customer care calls, trying different ways in the transcription and comparing mono vs stereo transcription',
    'medium',
    'In Progress',
    null::date,
    'Tasneem',
    7
  ),  (
    'B2B Recharge Prediction',
    'Covering the full B2B base with recharge prediction',
    'medium',
    'On Hold',
    '2026-11-01'::date,
    'Mohamed Galal',
    8
  ),  (
    'Sales Advisor',
    'Web app to suggest for users suitable tariff for them based on their usage and preferences',
    'high',
    'On Hold',
    null::date,
    'Laila Tamer',
    9
  ),  (
    'PPO',
    'AI chatbot to ease the user journey in the PPO services inside MaxIT Orange app',
    'high',
    'Testing',
    '2026-10-31'::date,
    'Ahmed Kamel',
    10
  )
),
matched as (
  select
    w.id as work_item_id,
    w.description as current_description,
    w.assignee as current_assignee,
    w.priority as current_priority,
    w.end_date as current_end_date,
    i.description as sheet_description,
    i.priority as sheet_priority,
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
         end_date = coalesce(w.end_date, m.sheet_end_date)
    from matched m
   where w.id = m.work_item_id
     and (
       (nullif(btrim(w.description), '') is null and nullif(btrim(m.sheet_description), '') is not null)
       or (m.incomplete_owner and m.sheet_assignee is not null)
       or (m.incomplete_owner and m.sheet_priority is not null
           and lower(btrim(w.priority)) is distinct from lower(btrim(m.sheet_priority)))
       or (w.end_date is null and m.sheet_end_date is not null)
     )
  returning w.id
),
updated_tracks as (
  update public.work_item_team_tracks as t
     set status_id = m.sheet_status_id,
         end_date = coalesce(t.end_date, m.sheet_end_date)
    from matched m
   where t.work_item_id = m.work_item_id
     and lower(btrim(t.team_name)) = 'ds'
     and (
       t.status_id is distinct from m.sheet_status_id
       or (t.end_date is null and m.sheet_end_date is not null)
     )
  returning t.work_item_id
)
insert into public.work_item_team_tracks (
  work_item_id, team_name, status_id, start_date, end_date, sort_order
)
select m.work_item_id, 'DS', m.sheet_status_id, null, m.sheet_end_date, 0
  from matched m
 where not exists (
   select 1 from public.work_item_team_tracks t
    where t.work_item_id = m.work_item_id
      and lower(btrim(t.team_name)) = 'ds'
 )
   and (select count(*) from updated_items) >= 0
   and (select count(*) from updated_tracks) >= 0;

-- Step 2: insert projects that still do not exist.
with ws as (
  select id from public.workspaces where slug = 'data-lake'
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
    'OCR - B2B',
    'Detecting certain dials using OCR in PDF documents that contains list of customer data as images',
    'high',
    'In Progress',
    null::date,
    'Ahmed Kamel',
    0
  ),  (
    'OCR - B2C',
    'Automating the customer dial activation in orange shops using OCR to detect the ID and the contracts and match the data between them and integrating with siebel to send the status of the check',
    'high',
    'In Progress',
    null::date,
    'Youssef Khadragy',
    1
  ),  (
    'CVM Segmentation',
    'Clustering for CVM customers to be easier to group them',
    'medium',
    'In Progress',
    null::date,
    'Laila Tamer',
    2
  ),  (
    'ACA Family Tree',
    'Clustering and resolution of records of Egypt national data like finiding missing records or matching records from different sources of same person',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Mohamed Galal',
    3
  ),  (
    'Finetuning',
    'Finetuning our Speech to text model to be used in the digital customer care calls',
    'medium',
    'In Progress',
    null::date,
    'Nariman',
    4
  ),  (
    'Smart Capex',
    'Taking CAPEX decisions across the network',
    'low',
    'On Hold',
    null::date,
    'Youssef Khadragy',
    5
  ),  (
    'Multisim detection revamp',
    'Revamping the multisim resolution through AI',
    'low',
    'On Hold',
    null::date,
    'Mohamed Galal',
    6
  ),  (
    'Speech customization',
    'Adding more features for the transcriptions and summaries of the customer care calls, trying different ways in the transcription and comparing mono vs stereo transcription',
    'medium',
    'In Progress',
    null::date,
    'Tasneem',
    7
  ),  (
    'B2B Recharge Prediction',
    'Covering the full B2B base with recharge prediction',
    'medium',
    'On Hold',
    '2026-11-01'::date,
    'Mohamed Galal',
    8
  ),  (
    'Sales Advisor',
    'Web app to suggest for users suitable tariff for them based on their usage and preferences',
    'high',
    'On Hold',
    null::date,
    'Laila Tamer',
    9
  ),  (
    'PPO',
    'AI chatbot to ease the user journey in the PPO services inside MaxIT Orange app',
    'high',
    'Testing',
    '2026-10-31'::date,
    'Ahmed Kamel',
    10
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
select id, 'DS', status_id, null, end_date, 0
from inserted;

