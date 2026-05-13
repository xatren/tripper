-- Enriched stop / pin fields (categories, rating, notes, etc.)

alter table public.stops add column if not exists place_category text
  not null default 'scenic_view'
  constraint stops_place_category_check check (place_category in (
    'hotel', 'restaurant', 'scenic_view', 'national_park', 'gas_station', 'hidden_spot',
    'camping', 'coffee_stop', 'city', 'beach', 'museum', 'activity'
  ));

alter table public.stops add column if not exists state text;
alter table public.stops add column if not exists notes text;

alter table public.stops add column if not exists rating smallint
  constraint stops_rating_check check (rating is null or (rating >= 1 and rating <= 5));

alter table public.stops add column if not exists estimated_cost numeric(10, 2);
alter table public.stops add column if not exists day_number integer;

alter table public.stops add column if not exists is_favorite boolean not null default false;
