-- Add PE / Development / Data Lake Operations workspaces (Jira-mirrored).
-- workspaces.sort_order is globally unique; bump before swapping PE vs Platform.

update public.workspaces
   set sort_order = 100
 where slug = 'platform-development'
   and sort_order = 1;

update public.workspaces
   set sort_order = 1
 where slug = 'pe-development';

update public.workspaces
   set sort_order = 2
 where slug = 'platform-development';

insert into public.workspaces (id, slug, name, description, sort_order)
values
  ('10000000-0000-4000-8000-000000000004', 'pe-operations', 'PE Operations', 'PE operations delivery workspace.', 3),
  ('10000000-0000-4000-8000-000000000005', 'development-operations', 'Development Operations', 'Development operations delivery workspace.', 4),
  ('10000000-0000-4000-8000-000000000006', 'datalake-operations', 'Data Lake Operations', 'Data lake operations delivery workspace.', 5)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
values
  ('20000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000004', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000004', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000004', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000005', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000005', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000005', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000005', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000006', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000006', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000006', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000006', 'Completed', '#16a34a', 3, 'completed')
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

insert into public.workspace_jira_settings (workspace_id, enabled)
select id, true
  from public.workspaces
 where slug in ('pe-operations', 'development-operations', 'datalake-operations')
on conflict (workspace_id) do update
set enabled = excluded.enabled;

insert into public.jira_status_mappings (workspace_id, jira_status_name, status_id)
select w.id, mapping.jira_status_name, s.id
  from public.workspaces w
 cross join (
   values
     ('To Do', 'In Progress'),
     ('Open', 'In Progress'),
     ('Backlog', 'In Progress'),
     ('Selected for Development', 'In Progress'),
     ('In Progress', 'In Progress'),
     ('In Review', 'In Progress'),
     ('In Development', 'In Progress'),
     ('Code Review', 'In Progress'),
     ('QA', 'In Progress'),
     ('Testing', 'In Progress'),
     ('Blocked', 'At Risk'),
     ('On Hold', 'At Risk'),
     ('Impediment', 'At Risk'),
     ('Done', 'Completed'),
     ('Closed', 'Completed'),
     ('Resolved', 'Completed'),
     ('Cancelled', 'Completed'),
     ('Canceled', 'Completed')
 ) as mapping(jira_status_name, dashboard_status_name)
 join public.statuses s
   on s.workspace_id = w.id
  and s.name = mapping.dashboard_status_name
 where w.slug in ('pe-operations', 'development-operations', 'datalake-operations')
on conflict (workspace_id, jira_status_name) do update
set status_id = excluded.status_id,
    updated_at = now();
