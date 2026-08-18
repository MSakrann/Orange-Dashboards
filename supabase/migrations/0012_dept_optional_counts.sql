-- Glance stats and per-team project counts are optional.
-- Empty (null) values are hidden on the public portfolio.
-- Also adds project_count if migration 0011 was never applied.

alter table public.dept_teams
  add column if not exists project_count integer;

alter table public.dept_teams
  alter column project_count drop not null;

alter table public.dept_teams
  alter column project_count drop default;

update public.dept_teams
   set project_count = null
 where project_count = 0;

alter table public.dept_profile
  alter column stat_teams drop not null;

alter table public.dept_profile
  alter column stat_members drop not null;

alter table public.dept_profile
  alter column stat_active_projects drop not null;
