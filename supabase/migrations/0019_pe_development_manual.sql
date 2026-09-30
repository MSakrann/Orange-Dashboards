-- Hide the Jira-mirrored PE Development workspace from the product list and
-- add a manual editable PE Development workspace (Hot Topics / Platforms-style).
-- Idempotent.

update public.workspaces
   set sort_order = 101,
       name = 'PE Development Jira',
       description = 'PE development delivery workspace (hidden Jira mirror).'
 where slug = 'pe-development';

insert into public.workspaces (id, slug, name, description, sort_order)
values (
  '10000000-0000-4000-8000-000000000008',
  'pe-delivery',
  'PE Development',
  'Promo engine delivery priorities tracked manually by the team.',
  1
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
  ('20000000-0000-4000-8000-00000000001d', '10000000-0000-4000-8000-000000000008', 'Planning', '#23b123', 0, 'active'),
  ('20000000-0000-4000-8000-00000000001e', '10000000-0000-4000-8000-000000000008', 'In Progress', '#23b123', 1, 'active'),
  ('20000000-0000-4000-8000-00000000001f', '10000000-0000-4000-8000-000000000008', 'Done', '#16a34a', 2, 'completed'),
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000008', 'Delayed', '#ef4444', 3, 'delayed')
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order,
  reporting_category = excluded.reporting_category;

-- Ensure the manual workspace is not Jira-linked.
delete from public.workspace_jira_settings
 where workspace_id = '10000000-0000-4000-8000-000000000008';
