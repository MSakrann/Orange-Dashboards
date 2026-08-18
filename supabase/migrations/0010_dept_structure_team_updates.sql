alter table public.dept_teams
  add column if not exists activity_summary text not null default ''
    check (char_length(activity_summary) <= 500);

update public.dept_teams
   set activity_summary = case name
     when 'PE Development' then '44 active, 24 in development'
     when 'Platform Development' then '18 active, 8 in rollout'
     when 'PE Operations' then '12 active, 4 awaiting closure'
     when 'Development Operations' then '20 active, 6 in release prep'
     when 'Data Lake Operations' then '9 active, 3 under analysis'
     else activity_summary
   end
 where coalesce(activity_summary, '') = '';

create or replace function public.enforce_dept_teams_max()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_count integer;
begin
  select count(*)::int into team_count from public.dept_teams;
  if tg_op = 'INSERT' and team_count >= 6 then
    raise exception 'Maximum of 6 teams allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists dept_teams_enforce_max on public.dept_teams;
create trigger dept_teams_enforce_max
before insert on public.dept_teams
for each row execute function public.enforce_dept_teams_max();
