begin;

insert into public.workspaces (id, slug, name, description, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', 'hot-topics', 'Hot Topics', 'Cross-team operational priorities and escalations.', 0),
  ('10000000-0000-4000-8000-000000000002', 'platform-development', 'Platform Development', 'Platform development delivery workspace.', 1),
  ('10000000-0000-4000-8000-000000000003', 'pe-development', 'PE Development', 'Platform engineering delivery workspace.', 2)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'Completed', '#16a34a', 3, 'completed'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', 'In Progress', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', 'At Risk', '#f59e0b', 1, 'risk'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000003', 'Delayed', '#ef4444', 2, 'delayed'),
  ('20000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000003', 'Completed', '#16a34a', 3, 'completed')
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

insert into public.work_items (
  id, workspace_id, parent_id, title, description, status_id, priority,
  progress, start_date, end_date, assignee, sort_order
)
values
  -- legacy-project: source id 9
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null,
   'Operations Team Open Tickets',
   E'Open Tickets: 10\nPending Tickets: 8\nSD Manager Open Tickets: 5',
   '20000000-0000-4000-8000-000000000001', 'high', 100, '2026-05-15', null, 'Marwa Saleh', 0),
  -- legacy-project: source id 1
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', null,
   'Ops Received Requests Ticketing System',
   'SD Manager configured and being used now.',
   '20000000-0000-4000-8000-000000000004', 'medium', 100, '2026-05-15', null, 'Marwa Saleh', 1),
  -- legacy-project: source id 2
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', null,
   'Price up documentation',
   'Create a consolidated price up documentation for all teams. ',
   '20000000-0000-4000-8000-000000000004', 'medium', 100, '2026-05-15', '2026-06-01', 'Mouhab Mahmoud', 2),
  -- legacy-project: source id 3
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', null,
   '2026 Harwdare With Networks Team',
   'Follow up on acquiring the servers from Amgad''s team and delivering it to our data centers in Obour.',
   '20000000-0000-4000-8000-000000000001', 'high', 0, '2026-05-15', null, 'Mouhab Mahhmoud', 3),
  -- legacy-project: source id 4
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', null,
   'Development Team Projects Management',
   'Setting up JIRA for Platform Development team.',
   '20000000-0000-4000-8000-000000000001', 'high', 80, '2026-06-01', '2026-06-15', 'Mouhab Mahhmoud', 4),
  -- legacy-project: source id 5
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', null,
   'PE Team Projects Management',
   'Setting up JIRA for Platform Development team.',
   '20000000-0000-4000-8000-000000000001', 'high', 90, '2026-06-01', '2026-06-15', 'Mouhab Mahhmoud', 5),
  -- legacy-project: source id 6
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', null,
   'Openshift License',
   'Currently we are set on Linux Plus',
   '20000000-0000-4000-8000-000000000003', 'medium', 50, '2026-05-01', null, 'Mouhab Mahhmoud', 6),
  -- legacy-project: source id 7
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', null,
   'DPI Servers',
   'Getting a date from El Fekki',
   '20000000-0000-4000-8000-000000000003', 'medium', 50, '2026-05-01', null, 'Mouhab Mahmoud', 7),
  -- legacy-project: source id 8
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', null,
   'Data Lake Reports Optimization',
   E'Total Done: 6 reports\nPending: 2 reports',
   '20000000-0000-4000-8000-000000000001', 'medium', 0, '2026-05-01', null, 'Marwa Saleh', 8),
  -- legacy-project: source id 10
  ('30000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', null,
   'Promo Engine Storage Issue',
   'Check with Mohamed AbdelMaksoud',
   '20000000-0000-4000-8000-000000000001', 'medium', 0, '2026-06-21', null, 'Mouhab Mahmoud', 9),
  -- legacy-project: source id 11, normalized occurrence 1
  ('30000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', null,
   'Promo Engine Upgrade Server Issue',
   'Check with Mohamed AbdelMaksoud',
   '20000000-0000-4000-8000-000000000001', 'medium', 0, '2026-05-01', null, 'Mouhab Mahmoud', 10),
  -- legacy-project: source id 11, normalized occurrence 2
  ('30000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000001', null,
   'Pacific Oceanstore servers acquisition',
   'Finalizing offers from vendors with Hany',
   '20000000-0000-4000-8000-000000000001', 'medium', 0, '2026-06-15', null, 'Mouhab Mahmoud', 11),
  -- legacy-project: source id 11, normalized occurrence 3
  ('30000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000001', null,
   'SSD Storage Upgrade',
   'Finalizing offers from suppliers with Hany',
   '20000000-0000-4000-8000-000000000001', 'medium', 0, '2026-06-15', null, 'Mouhab Mahmoud', 12)
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  parent_id = excluded.parent_id,
  title = excluded.title,
  description = excluded.description,
  status_id = excluded.status_id,
  priority = excluded.priority,
  progress = excluded.progress,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  assignee = excluded.assignee,
  sort_order = excluded.sort_order;

insert into public.comments (id, work_item_id, author_name, body)
values
  -- legacy-comment: Operations Team Open Tickets
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Marwa', '1 pending SD'),
  -- legacy-comment: 2026 Harwdare With Networks Team
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Mouhab', 'Following up on creating power survey')
on conflict (id) do update set
  work_item_id = excluded.work_item_id,
  author_name = excluded.author_name,
  body = excluded.body;

commit;
