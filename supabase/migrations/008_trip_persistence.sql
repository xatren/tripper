-- Persist data the UI already collects but previously kept client-side only:
--   trips.currency — picked in the New Trip wizard (step 4), shown in Budget
--   trips.vibe     — picked in the New Trip wizard (step 1)
--   stops.nights   — per-stop night counter on the Plan tab
alter table public.trips
  add column if not exists currency text not null default 'USD'
    check (currency in ('USD', 'EUR', 'GBP', 'TRY')),
  add column if not exists vibe text
    check (vibe is null or vibe in ('Road', 'Fly', 'Camp', 'Beach', 'Mountain', 'Backpack'));

alter table public.stops
  add column if not exists nights integer not null default 1
    check (nights >= 0);
