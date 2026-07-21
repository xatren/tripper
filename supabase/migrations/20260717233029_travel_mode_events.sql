-- Phase 13: travel-mode event history. Itinerary rows remain the plan source;
-- journal_entries remain private/user-authored memories. This table records
-- the actual journey without forcing those sources into one storage model.

create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  event_type text not null check (event_type in ('arrived', 'completed', 'photo', 'note', 'unplanned', 'expense-link')),
  -- occurred_at comes from the user/device action; recorded_at is server time.
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  visibility text not null default 'trip' check (visibility in ('trip', 'private')),
  metadata jsonb not null default '{}'::jsonb,
  is_hidden boolean not null default false,
  idempotency_key uuid not null,
  updated_at timestamptz not null default now(),
  constraint trip_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint trip_events_metadata_size check (octet_length(metadata::text) <= 2048),
  constraint trip_events_metadata_keys check (
    metadata - array['title', 'address', 'expense_id', 'journal_entry_id', 'location_lat', 'location_lng', 'status_from', 'status_to'] = '{}'::jsonb
  ),
  constraint trip_events_location_pair check (
    (metadata ? 'location_lat') = (metadata ? 'location_lng')
  ),
  unique (trip_id, idempotency_key)
);

create index trip_events_trip_occurred_idx on public.trip_events (trip_id, occurred_at);
create index trip_events_itinerary_item_idx on public.trip_events (itinerary_item_id);
create index trip_events_created_by_idx on public.trip_events (created_by);

create trigger trip_events_updated_at
  before update on public.trip_events
  for each row execute procedure public.handle_updated_at();

alter table public.trip_events enable row level security;

create policy "Trip members can view visible trip events" on public.trip_events
  for select to authenticated
  using (
    public.is_trip_member(trip_id)
    and (visibility = 'trip' or created_by = (select auth.uid()))
  );
create policy "Trip editors can insert trip events" on public.trip_events
  for insert to authenticated
  with check (public.is_trip_editor(trip_id) and created_by = (select auth.uid()));
create policy "Creators can update user trip events" on public.trip_events
  for update to authenticated
  using (created_by = (select auth.uid()) and public.is_trip_editor(trip_id))
  with check (created_by = (select auth.uid()) and public.is_trip_editor(trip_id));
create policy "Creators can delete user trip events" on public.trip_events
  for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_trip_editor(trip_id));

revoke all on table public.trip_events from anon;
revoke all on table public.trip_events from authenticated;
grant select, insert, update, delete on table public.trip_events to authenticated;

-- Journal keeps its own table, but gains optional linkage, user occurrence
-- time, visibility and explicit-location fields for the unified presentation.
alter table public.journal_entries
  add column if not exists itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  add column if not exists occurred_at timestamptz,
  add column if not exists visibility text not null default 'trip' check (visibility in ('trip', 'private')),
  add column if not exists is_hidden boolean not null default false,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists updated_at timestamptz not null default now(),
  add constraint journal_entries_location_pair check ((location_lat is null) = (location_lng is null));

create index if not exists journal_entries_itinerary_item_idx on public.journal_entries (itinerary_item_id);
create index if not exists journal_entries_created_by_idx on public.journal_entries (created_by);
create unique index if not exists journal_photos_storage_path_key on public.journal_photos (storage_path);

drop trigger if exists journal_entries_updated_at on public.journal_entries;
create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row execute procedure public.handle_updated_at();

drop policy if exists "Trip members can view journal entries" on public.journal_entries;
drop policy if exists "Trip editors can insert journal entries" on public.journal_entries;
drop policy if exists "Trip editors can update journal entries" on public.journal_entries;
drop policy if exists "Trip editors can delete journal entries" on public.journal_entries;
create policy "Trip members can view journal entries" on public.journal_entries
  for select to authenticated
  using (public.is_trip_member(trip_id) and (visibility = 'trip' or created_by = (select auth.uid())));
create policy "Trip editors can insert journal entries" on public.journal_entries
  for insert to authenticated
  with check (public.is_trip_editor(trip_id) and created_by = (select auth.uid()));
create policy "Journal creators can update entries" on public.journal_entries
  for update to authenticated
  using (public.is_trip_editor(trip_id) and created_by = (select auth.uid()))
  with check (public.is_trip_editor(trip_id) and created_by = (select auth.uid()));
create policy "Journal creators can delete entries" on public.journal_entries
  for delete to authenticated
  using (public.is_trip_editor(trip_id) and created_by = (select auth.uid()));

drop policy if exists "Trip members can view journal photos" on public.journal_photos;
drop policy if exists "Trip editors can insert journal photos" on public.journal_photos;
drop policy if exists "Trip editors can delete journal photos" on public.journal_photos;
create policy "Members can view visible journal photos" on public.journal_photos
  for select to authenticated
  using (exists (
    select 1 from public.journal_entries entry
    where entry.id = entry_id and public.is_trip_member(entry.trip_id)
      and (entry.visibility = 'trip' or entry.created_by = (select auth.uid()))
  ));
create policy "Journal creators can insert photos" on public.journal_photos
  for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and exists (
    select 1 from public.journal_entries entry
    where entry.id = entry_id and entry.created_by = (select auth.uid()) and public.is_trip_editor(entry.trip_id)
  ));
create policy "Journal creators can delete photos" on public.journal_photos
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) and exists (
    select 1 from public.journal_entries entry
    where entry.id = entry_id and entry.created_by = (select auth.uid()) and public.is_trip_editor(entry.trip_id)
  ));

-- A private bucket policy must also prevent member-wide object listing. Read
-- access is granted only after an authorized journal_photos metadata row is
-- linked; draft cleanup still uses the editor-scoped DELETE policy.
drop policy if exists "Trip members can view trip photos" on storage.objects;
create policy "Members can view linked visible trip photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trip-photos' and exists (
      select 1 from public.journal_photos photo
      join public.journal_entries entry on entry.id = photo.entry_id
      where photo.storage_path = name and public.is_trip_member(entry.trip_id)
        and (entry.visibility = 'trip' or entry.created_by = (select auth.uid()))
    )
  );

-- Atomic state transition + auto-event. Repeating the same idempotency key or
-- target status returns the canonical row and never creates a second event.
create or replace function public.transition_itinerary_status(
  p_trip_id uuid,
  p_item_id uuid,
  p_target_status text,
  p_occurred_at timestamptz,
  p_idempotency_key uuid,
  p_expected_updated_at timestamptz default null
)
returns public.itinerary_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itinerary_items;
  v_from text;
begin
  if (select auth.uid()) is null or not public.is_trip_editor(p_trip_id) then
    raise exception 'Not authorized to update this trip';
  end if;
  if p_target_status not in ('planned', 'on_the_way', 'arrived', 'completed', 'skipped') then
    raise exception 'Invalid itinerary status';
  end if;

  select * into v_item from public.itinerary_items
  where id = p_item_id and trip_id = p_trip_id
  for update;
  if not found then raise exception 'Itinerary item not found'; end if;

  v_from := v_item.status;
  if v_from = p_target_status then return v_item; end if;
  if p_expected_updated_at is not null and v_item.updated_at <> p_expected_updated_at then
    raise exception 'Itinerary item changed elsewhere' using errcode = '40001';
  end if;
  if not (
    (v_from = 'planned' and p_target_status in ('on_the_way', 'arrived', 'completed', 'skipped')) or
    (v_from = 'on_the_way' and p_target_status in ('arrived', 'completed', 'skipped')) or
    (v_from = 'arrived' and p_target_status in ('completed', 'skipped'))
  ) then
    raise exception 'Invalid status transition: % -> %', v_from, p_target_status;
  end if;

  update public.itinerary_items set status = p_target_status
  where id = p_item_id returning * into v_item;

  if p_target_status in ('arrived', 'completed') then
    insert into public.trip_events (
      trip_id, itinerary_item_id, event_type, occurred_at, created_by,
      visibility, metadata, idempotency_key
    ) values (
      p_trip_id, p_item_id, p_target_status, coalesce(p_occurred_at, now()), (select auth.uid()),
      'trip', jsonb_build_object('status_from', v_from, 'status_to', p_target_status), p_idempotency_key
    ) on conflict (trip_id, idempotency_key) do nothing;
  end if;
  return v_item;
end;
$$;

revoke all on function public.transition_itinerary_status(uuid, uuid, text, timestamptz, uuid, timestamptz) from public, anon;
grant execute on function public.transition_itinerary_status(uuid, uuid, text, timestamptz, uuid, timestamptz) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_events'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_events';
  end if;
end $$;
