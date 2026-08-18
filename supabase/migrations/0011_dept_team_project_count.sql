alter table public.dept_teams
  add column if not exists project_count integer not null default 0
    check (project_count >= 0 and project_count <= 9999);
