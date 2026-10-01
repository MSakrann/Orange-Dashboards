-- Rename ops week-status values Active/Impacted -> Clear/Delayed
-- for PE Ops and Data Lake Ops cards.

alter table public.work_items
  drop constraint if exists work_items_last_week_status_check;

alter table public.work_items
  drop constraint if exists work_items_current_status_check;

update public.work_items
   set last_week_status = case last_week_status
         when 'Active' then 'Clear'
         when 'Impacted' then 'Delayed'
         else last_week_status
       end,
       current_status = case current_status
         when 'Active' then 'Clear'
         when 'Impacted' then 'Delayed'
         else current_status
       end
 where last_week_status in ('Active', 'Impacted')
    or current_status in ('Active', 'Impacted');

alter table public.work_items
  add constraint work_items_last_week_status_check
  check (last_week_status is null or last_week_status in ('Clear', 'Delayed'));

alter table public.work_items
  add constraint work_items_current_status_check
  check (current_status is null or current_status in ('Clear', 'Delayed'));
