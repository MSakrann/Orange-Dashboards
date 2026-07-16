-- Fix misleading default Jira → dashboard status mappings.
-- "To Do" / backlog must not map to Delayed.

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
 where w.slug in ('pe-development', 'platform-development')
on conflict (workspace_id, jira_status_name) do update
set status_id = excluded.status_id,
    updated_at = now();
