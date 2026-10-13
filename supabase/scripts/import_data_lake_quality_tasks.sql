-- Import / reconcile Quality Dashboard Tasks into Data Lake and AI (data-lake).
-- 1) Replace known near-duplicate titles with sheet versions (update in place).
-- 2) Insert remaining sheet projects whose titles do not already exist.
-- Disregards Comments. Dual owners: "Name - Name" -> "Name & Name".
-- Safe if a previous import already created the sheet titles.

-- Step 1a: if both old and new titles exist, drop the old near-duplicate.
with ws as (
  select id from public.workspaces where slug = 'data-lake'
),
replacements (old_title, new_title) as (
  values
('Billing Database Migration', 'Billing DB Migration'),('Digital Migration from DB SPs to Kafka', 'Digital Migration - SP to Kafka'),('Billing Parameter Value Issue', 'Billing Parameter Value'),('Orange DSL Base - missing data from Siebel delta file issue', 'Orange DSL Base')
)
delete from public.work_items w
 using replacements r, ws
 where w.workspace_id = ws.id
   and w.parent_id is null
   and lower(btrim(w.title)) = lower(btrim(r.old_title))
   and exists (
     select 1 from public.work_items x
      where x.workspace_id = ws.id
        and x.parent_id is null
        and lower(btrim(x.title)) = lower(btrim(r.new_title))
   );

-- Step 1b: rename remaining old titles to sheet titles and refresh fields.
with ws as (
  select id from public.workspaces where slug = 'data-lake'
),
status_map as (
  select s.id, lower(btrim(s.name)) as name
    from public.statuses s
    join ws on ws.id = s.workspace_id
),
replacements (
  old_title, title, description, priority, status_name, end_date, assignee
) as (
  values
  (
    'Billing Database Migration',
    'Billing DB Migration',
    'Validate the migrated billing models and assess the columns missing from them.',
    'high',
    'On Hold',
    null::date,
    'Eman Abdelnasser'
  ),  (
    'Digital Migration from DB SPs to Kafka',
    'Digital Migration - SP to Kafka',
    'Validate the new Kafka stream against the current SP.',
    'high',
    'Pending',
    '2026-10-31'::date,
    'Salma Hany'
  ),  (
    'Billing Parameter Value Issue',
    'Billing Parameter Value',
    'Update the model logic so it loads with Date - 1 instead of Date - 2.',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Alaa Mohamed'
  ),  (
    'Orange DSL Base - missing data from Siebel delta file issue',
    'Orange DSL Base',
    'Change the integrated Siebel landline base from delta to snapshots to avoid missing rows and serve the analytical dashboard.',
    'medium',
    'In Progress',
    '2026-10-13'::date,
    'Salma Hany'
  )
),
updated as (
  update public.work_items as w
     set title = r.title,
         description = r.description,
         priority = r.priority,
         status_id = sm.id,
         end_date = r.end_date,
         start_date = null,
         assignee = r.assignee
    from replacements r
    cross join ws
    join status_map sm on sm.name = lower(btrim(r.status_name))
   where w.workspace_id = ws.id
     and w.parent_id is null
     and lower(btrim(w.title)) = lower(btrim(r.old_title))
  returning w.id, w.status_id, w.end_date
),
updated_tracks as (
  update public.work_item_team_tracks as t
     set status_id = u.status_id,
         start_date = null,
         end_date = u.end_date
    from updated u
   where t.work_item_id = u.id
     and lower(btrim(t.team_name)) = 'quality'
  returning t.work_item_id
)
insert into public.work_item_team_tracks (
  work_item_id, team_name, status_id, start_date, end_date, sort_order
)
select u.id, 'Quality', u.status_id, null, u.end_date, 0
  from updated u
 where not exists (
   select 1 from public.work_item_team_tracks t
    where t.work_item_id = u.id
      and lower(btrim(t.team_name)) = 'quality'
 )
   and (select count(*) from updated_tracks) >= 0;

-- Step 1c: refresh fields for projects that already use the sheet title
-- (exact matches and replacements completed in 1a/1b).
with ws as (
  select id from public.workspaces where slug = 'data-lake'
),
status_map as (
  select s.id, lower(btrim(s.name)) as name
    from public.statuses s
    join ws on ws.id = s.workspace_id
),
incoming (
  title, description, priority, status_name, end_date, assignee
) as (
  values
  (
    'Billing DB Migration',
    'Validate the migrated billing models and assess the columns missing from them.',
    'high',
    'On Hold',
    null::date,
    'Eman Abdelnasser'
  ),  (
    'Digital Migration - SP to Kafka',
    'Validate the new Kafka stream against the current SP.',
    'high',
    'Pending',
    '2026-10-31'::date,
    'Salma Hany'
  ),  (
    'Billing Parameter Value',
    'Update the model logic so it loads with Date - 1 instead of Date - 2.',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Alaa Mohamed'
  ),  (
    'Orange DSL Base',
    'Change the integrated Siebel landline base from delta to snapshots to avoid missing rows and serve the analytical dashboard.',
    'medium',
    'In Progress',
    '2026-10-13'::date,
    'Salma Hany'
  )
),
updated as (
  update public.work_items as w
     set description = i.description,
         priority = i.priority,
         status_id = sm.id,
         end_date = i.end_date,
         start_date = null,
         assignee = i.assignee
    from incoming i
    cross join ws
    join status_map sm on sm.name = lower(btrim(i.status_name))
   where w.workspace_id = ws.id
     and w.parent_id is null
     and lower(btrim(w.title)) = lower(btrim(i.title))
  returning w.id, w.status_id, w.end_date
),
updated_tracks as (
  update public.work_item_team_tracks as t
     set status_id = u.status_id,
         start_date = null,
         end_date = u.end_date
    from updated u
   where t.work_item_id = u.id
     and lower(btrim(t.team_name)) = 'quality'
  returning t.work_item_id
)
insert into public.work_item_team_tracks (
  work_item_id, team_name, status_id, start_date, end_date, sort_order
)
select u.id, 'Quality', u.status_id, null, u.end_date, 0
  from updated u
 where not exists (
   select 1 from public.work_item_team_tracks t
    where t.work_item_id = u.id
      and lower(btrim(t.team_name)) = 'quality'
 )
   and (select count(*) from updated_tracks) >= 0;

-- Step 2: insert remaining sheet projects that still do not exist by title.
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
    'Credit Scoring Engine - Prepaid',
    'Build a telecom credit scoring engine for the prepaid base, mirroring the production postpaid model, to cover the full Orange base and integrate with CIB and Connect.',
    'high',
    'Planning',
    '2026-12-31'::date,
    'Eman Abdelnasser & Talaat Ashraf',
    0
  ),  (
    'NTRA Fraud Voice & SMS Reports',
    'Add new columns requested by NTRA, covering POS details, to the Fraud Voice and SMS reports.',
    'high',
    'In Progress',
    '2026-10-13'::date,
    'Eman Abdelnasser',
    1
  ),  (
    'NTRA Child Control 3 Reports (Weekly / Monthly)',
    'Build new Child Control reports for NTRA, categorized into two services: Etamen and Etamen 3la Akher.',
    'high',
    'Pending',
    '2026-10-15'::date,
    'Eman Abdelnasser',
    2
  ),  (
    'Prepaid DSL Account History',
    'Launch a full prepaid DSL portfolio with dedicated packages, extensions, and supporting systems to complement existing offerings and improve profitability.',
    'high',
    'In Progress',
    '2026-10-13'::date,
    'Talaat Ashraf',
    3
  ),  (
    'Siebel 360',
    'Enhance the existing CVM Siebel 360 model.',
    'low',
    'In Progress',
    '2026-10-22'::date,
    'Salma Hany',
    4
  ),  (
    'RO CDR - OCC Upgrade',
    'Assess the IN and EMM changes needed to charge VoLTE CDRs from the IN within the normal CCN voice stream, using a distinct flag in the charging context.',
    'high',
    'In Progress',
    null::date,
    'Alaa Mohamed',
    5
  ),  (
    'Fawry Deployment Build-27',
    'Retest the 12 quality issues detected in Fawry data related to CVM earn, burn, and expiry points; the issues appear to have existed since the Fawry launch.',
    'high',
    'In Progress',
    '2026-10-13'::date,
    'Eman Abdelnasser & Salma Hany',
    6
  ),  (
    'Siebel SRs - Smart Script Update',
    'Update the existing Siebel Service Requests query by adding new columns for Smart Scripts.',
    'medium',
    'In Progress',
    '2026-10-15'::date,
    'Eman Abdelnasser',
    7
  ),  (
    'Siebel SRs - Complaints',
    'Test a new reference in Siebel Service Requests to log the customer''s answer to each complaint question.',
    'medium',
    'Pending',
    '2026-10-15'::date,
    'Alaa Mohamed',
    8
  ),  (
    'Billing DB Migration',
    'Validate the migrated billing models and assess the columns missing from them.',
    'high',
    'On Hold',
    null::date,
    'Eman Abdelnasser',
    9
  ),  (
    'Billing Contract History - Users',
    'Enrich the model with the username of the agent who modified each contract, for better tracking of contract history and to fulfill HR requests.',
    'high',
    'Pending',
    '2026-10-15'::date,
    'Alaa Mohamed',
    10
  ),  (
    'Digital Migration - SP to Kafka',
    'Validate the new Kafka stream against the current SP.',
    'high',
    'Pending',
    '2026-10-31'::date,
    'Salma Hany',
    11
  ),  (
    'Wincash Material Stock',
    'Enrich the Datalake with a new Wincash model covering material stock.',
    'low',
    'Pending',
    '2026-10-20'::date,
    'Alaa Mohamed',
    12
  ),  (
    'NSA eKYC Report',
    'Add a new report to the NSA reports that shares daily SDK transactions based on Cyshield logs.',
    'high',
    'Pending',
    '2026-10-31'::date,
    'Eman Abdelnasser',
    13
  ),  (
    'Revamp History OC - Wallet Insights',
    'Revamp the OC Wallet Insights so Digital can rely on the Datalake API.',
    'medium',
    'Planning',
    null::date,
    'Eman Abdelnasser & Talaat Ashraf',
    14
  ),  (
    'Subscriber History - Recovery Process',
    'Upgrade the subscriber model to keep accurate history for Siebel, enhance the IN version, and update the recovery mechanism, following the earlier subscriber-fix milestones.',
    'high',
    'On Hold',
    null::date,
    'Eman Abdelnasser',
    15
  ),  (
    'Billing Tickler Records',
    'Enrich the model with all billing ticklers and update the source files to share only delta changes.',
    'high',
    'Pending',
    null::date,
    'Eman Abdelnasser',
    16
  ),  (
    'Digital eKYC',
    'Ingest new raw data on eKYC orders (online sales, data gathering, SDK trials) into the Datalake, including cleansing.',
    'high',
    'In Progress',
    '2026-10-31'::date,
    'Eman Abdelnasser & Salma Hany',
    17
  ),  (
    'Billing Parameter Value',
    'Update the model logic so it loads with Date - 1 instead of Date - 2.',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Alaa Mohamed',
    18
  ),  (
    'Orange DSL Base',
    'Change the integrated Siebel landline base from delta to snapshots to avoid missing rows and serve the analytical dashboard.',
    'medium',
    'In Progress',
    '2026-10-13'::date,
    'Salma Hany',
    19
  ),  (
    'Fawry Migration to CDC',
    'Implement CDC to replace unstable direct reads from Fawry’s database, with a future phase planned to improve daily SFTP reporting.',
    'high',
    'Pending',
    null::date,
    null,
    20
  ),  (
    'MCIT Project',
    'Review all silver layer models to detect source issues, model issues and support building the dashboard and analytical models, covering demopraphics fully and employment partially',
    'high',
    'In Progress',
    '2026-10-15'::date,
    'Omar Mazhar',
    21
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
select id, 'Quality', status_id, null, end_date, 0
from inserted;

-- Sanity: sheet titles still missing after reconcile (expect none).
with ws as (
  select id from public.workspaces where slug = 'data-lake'
),
incoming(title) as (
  values
('Credit Scoring Engine - Prepaid'),('NTRA Fraud Voice & SMS Reports'),('NTRA Child Control 3 Reports (Weekly / Monthly)'),('Prepaid DSL Account History'),('Siebel 360'),('RO CDR - OCC Upgrade'),('Fawry Deployment Build-27'),('Siebel SRs - Smart Script Update'),('Siebel SRs - Complaints'),('Billing DB Migration'),('Billing Contract History - Users'),('Digital Migration - SP to Kafka'),('Wincash Material Stock'),('NSA eKYC Report'),('Revamp History OC - Wallet Insights'),('Subscriber History - Recovery Process'),('Billing Tickler Records'),('Digital eKYC'),('Billing Parameter Value'),('Orange DSL Base'),('Fawry Migration to CDC'),('MCIT Project')
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
