-- Rename Development Operations -> Dev Ops and place it before PE Operations.
-- workspaces.sort_order is globally unique, so bump before swapping.

update public.workspaces
   set sort_order = 103
 where slug = 'pe-operations'
   and sort_order = 3;

update public.workspaces
   set name = 'Dev Ops',
       sort_order = 3
 where slug = 'development-operations';

update public.workspaces
   set sort_order = 4
 where slug = 'pe-operations';
