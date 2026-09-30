-- Hide Jira-mirrored PE Operations and Data Lake Operations workspaces from the
-- product list and add manual editable replacements (Hot Topics / Platforms-style).
-- Idempotent.

update public.workspaces
   set sort_order = 102,
       name = 'PE Operations Jira',
       description = 'PE operations delivery workspace (hidden Jira mirror).'
 where slug = 'pe-operations';

update public.workspaces
   set sort_order = 103,
       name = 'Data Lake Operations Jira',
       description = 'Data lake operations delivery workspace (hidden Jira mirror).'
 where slug = 'datalake-operations';

insert into public.workspaces (id, slug, name, description, sort_order)
values
  (
    '10000000-0000-4000-8000-000000000009',
    'pe-ops',
    'PE Operations',
    'Promo engine operations priorities tracked manually by the team.',
    4
  ),
  (
    '10000000-0000-4000-8000-00000000000a',
    'datalake-ops',
    'Data Lake Operations',
    'Data lake operations priorities tracked manually by the team.',
    5
  )
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.statuses (
  id, workspace_id, name, color, sort_order, reporting_category
)
values
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000009', 'Planning', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000009', 'In Progress', '#23b123', 1, 'active'),
  ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000009', 'Done', '#16a34a', 2, 'completed'),
  ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000009', 'Delayed', '#ef4444', 3, 'delayed'),
  ('20000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-00000000000a', 'Planning', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-00000000000a', 'In Progress', '#23b123', 1, 'active'),
  ('20000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-00000000000a', 'Done', '#16a34a', 2, 'completed'),
  ('20000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-00000000000a', 'Delayed', '#ef4444', 3, 'delayed')
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Ensure the manual workspaces are not Jira-linked.
delete from public.workspace_jira_settings
 where workspace_id in (
   '10000000-0000-4000-8000-000000000009',
   '10000000-0000-4000-8000-00000000000a'
 );
