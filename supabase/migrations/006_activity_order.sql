-- Add ordering + time-of-day scheduling to activities
alter table public.activities
  add column if not exists order_index integer not null default 0,
  add column if not exists time_of_day  text;         -- "HH:MM" e.g. "09:30"

create index if not exists activities_stop_order_idx
  on public.activities(stop_id, order_index);
