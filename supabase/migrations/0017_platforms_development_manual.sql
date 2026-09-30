-- Hide the Jira-mirrored Platform Development workspace from the product list and
-- add a manual editable Platforms Development workspace (Hot Topics-style).
-- Idempotent: safe after 0016 or on its own.

update public.workspaces
   set sort_order = 100,
       name = 'Platform Development',
       description = 'Platform development delivery workspace (hidden Jira mirror).'
 where slug = 'platform-development';

insert into public.workspaces (id, slug, name, description, sort_order)
values (
  '10000000-0000-4000-8000-000000000007',
  'platforms-development',
  'Platforms Development',
  'Platform delivery priorities tracked manually by the team.',
  2
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
  ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000007', 'Planning', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000001a', '10000000-0000-4000-8000-000000000007', 'In Progress', '#23b123', 1, 'active'),
  ('20000000-0000-4000-8000-00000000001b', '10000000-0000-4000-8000-000000000007', 'Done', '#16a34a', 2, 'completed'),
  ('20000000-0000-4000-8000-00000000001c', '10000000-0000-4000-8000-000000000007', 'Delayed', '#ef4444', 3, 'delayed')
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Ensure the manual workspace is not Jira-linked.
delete from public.workspace_jira_settings
 where workspace_id = '10000000-0000-4000-8000-000000000007';
