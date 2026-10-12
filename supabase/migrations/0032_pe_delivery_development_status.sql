-- PE Development (pe-delivery): rename In Progress -> Development.

update public.statuses s
   set name = 'Development'
  from public.workspaces w
 where s.workspace_id = w.id
   and w.slug = 'pe-delivery'
   and lower(btrim(s.name)) = 'in progress';
