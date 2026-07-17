-- Real bookings (Phase 7): structured reservation records + private documents.
--
-- The Bookings tab previously only linked out to partner search pages. This
-- migration adds the traveller's own reservation records (flights, stays,
-- rentals, tickets, …) and a private Storage bucket for their confirmation
-- documents. Everything here is additive; no existing table changes shape.
--
-- Deliberate decisions:
--   * `itinerary_item_id` is ON DELETE SET NULL — removing a plan item must
--     never destroy the underlying booking record.
--   * `trip_id` is ON DELETE CASCADE — a deleted trip takes its bookings
--     (and, through the attachments FK cascade, their metadata rows) with it.
--     Storage objects are removed by the clients/routes before the row delete,
--     mirroring the journal-photo contract.
--   * No traveler sub-table in this phase: manual entry does not need per-person
--     rows yet, and sensitive identity data (passport numbers) must not be
--     stored. Add a narrow `reservation_travelers` table when a real need lands.

-- ── reservations ─────────────────────────────────────────────────────────────
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  -- Optional link to the plan item this booking realizes. SET NULL keeps the
  -- booking when the plan item is deleted.
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  reservation_type text not null
    check (reservation_type in (
      'flight', 'stay', 'car_rental', 'train', 'ferry',
      'restaurant', 'activity', 'pass', 'other'
    )),
  provider text,
  title text not null check (length(trim(title)) > 0),
  confirmation_number text check (confirmation_number is null or length(confirmation_number) <= 64),
  start_at timestamptz,
  end_at timestamptz,
  -- IANA zone the times were entered in, so clients re-render wall time.
  timezone text,
  address text,
  lat double precision,
  lng double precision,
  amount numeric(12, 2) check (amount is null or amount >= 0),
  currency text check (currency is null or currency in ('USD', 'EUR', 'GBP', 'TRY')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'deposit', 'paid', 'refunded')),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'pending', 'cancelled', 'completed')),
  booking_url text check (booking_url is null or booking_url ~* '^https?://'),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_order check (
    start_at is null or end_at is null or end_at >= start_at
  ),
  constraint reservations_coords_paired check (
    (lat is null) = (lng is null)
  )
);

-- List reads filter by trip and sort by start date; type filter is a chip row.
create index if not exists reservations_trip_start_idx
  on public.reservations (trip_id, start_at);
create index if not exists reservations_trip_type_idx
  on public.reservations (trip_id, reservation_type);
create index if not exists reservations_itinerary_item_idx
  on public.reservations (itinerary_item_id);
-- Account deletion sets created_by to null; keep that scan cheap.
create index if not exists reservations_created_by_idx
  on public.reservations (created_by);

drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at
  before update on public.reservations
  for each row execute procedure public.handle_updated_at();

alter table public.reservations enable row level security;

drop policy if exists "Trip members can view reservations" on public.reservations;
drop policy if exists "Trip editors can insert reservations" on public.reservations;
drop policy if exists "Trip editors can update reservations" on public.reservations;
drop policy if exists "Trip editors can delete reservations" on public.reservations;

create policy "Trip members can view reservations" on public.reservations
  for select using (public.is_trip_member(trip_id));
create policy "Trip editors can insert reservations" on public.reservations
  for insert with check (public.is_trip_editor(trip_id));
create policy "Trip editors can update reservations" on public.reservations
  for update using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));
create policy "Trip editors can delete reservations" on public.reservations
  for delete using (public.is_trip_editor(trip_id));

revoke all on table public.reservations from anon;
revoke all on table public.reservations from authenticated;
grant select, insert, update, delete on table public.reservations to authenticated;

-- ── reservation_attachments ──────────────────────────────────────────────────
-- Metadata rows for objects in the private `trip-documents` bucket. The object
-- path is client-generated from ids (`{trip_id}/reservations/{reservation_id}/{uuid}.{ext}`);
-- the user's original filename is display metadata only, never a path segment.
create table if not exists public.reservation_attachments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (length(trim(original_name)) > 0 and length(original_name) <= 255),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reservation_attachments_reservation_idx
  on public.reservation_attachments (reservation_id);
create index if not exists reservation_attachments_uploaded_by_idx
  on public.reservation_attachments (uploaded_by);

alter table public.reservation_attachments enable row level security;

drop policy if exists "Trip members can view reservation attachments" on public.reservation_attachments;
drop policy if exists "Trip editors can insert reservation attachments" on public.reservation_attachments;
drop policy if exists "Trip editors can delete reservation attachments" on public.reservation_attachments;

create policy "Trip members can view reservation attachments" on public.reservation_attachments
  for select using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_attachments.reservation_id
        and public.is_trip_member(r.trip_id)
    )
  );
create policy "Trip editors can insert reservation attachments" on public.reservation_attachments
  for insert with check (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and public.is_trip_editor(r.trip_id)
    )
  );
create policy "Trip editors can delete reservation attachments" on public.reservation_attachments
  for delete using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_attachments.reservation_id
        and public.is_trip_editor(r.trip_id)
    )
  );

-- Attachment rows are immutable (replace = delete + insert with a fresh uuid
-- path), so authenticated holds no UPDATE privilege at all.
revoke all on table public.reservation_attachments from anon;
revoke all on table public.reservation_attachments from authenticated;
grant select, insert, delete on table public.reservation_attachments to authenticated;

-- ── Storage bucket: trip-documents ───────────────────────────────────────────
-- Private from creation. Bucket-level MIME allowlist and size limit are the
-- server-side enforcement; client `accept` and pre-upload checks are UX only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-documents',
  'trip-documents',
  false,
  20971520, -- 20 MiB, matches reservation_attachments.size_bytes
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Trip members can view trip documents" on storage.objects;
drop policy if exists "Trip editors can upload trip documents" on storage.objects;
drop policy if exists "Trip editors can update trip documents" on storage.objects;
drop policy if exists "Trip editors can delete trip documents" on storage.objects;

create policy "Trip members can view trip documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-documents'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_member(trips.id)
    )
  );

-- Uploads must live under `{trip_id}/reservations/…` so no other feature can
-- squat in this bucket and cleanup contracts stay path-derivable.
create policy "Trip editors can upload trip documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-documents'
    and (storage.foldername(name))[2] = 'reservations'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

-- Clients never upsert (immutable uuid paths), but declare UPDATE explicitly so
-- any future replacement stays editor-scoped in both directions.
create policy "Trip editors can update trip documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-documents'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  )
  with check (
    bucket_id = 'trip-documents'
    and (storage.foldername(name))[2] = 'reservations'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

create policy "Trip editors can delete trip documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Same contract as the other trip domains: INSERT/UPDATE flow through the
-- trip-filtered channel; DELETE goes through the trip-scoped signal table.
-- Attachments follow their parent (clients refresh the scoped parent query).
alter table public.trip_realtime_deletes
  drop constraint if exists trip_realtime_deletes_table_name_check;
alter table public.trip_realtime_deletes
  add constraint trip_realtime_deletes_table_name_check
  check (table_name in ('stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items', 'reservations'));

create or replace function public.signal_trip_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name not in ('stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items', 'reservations') then
    raise exception 'Unsupported realtime delete source: %', tg_table_name;
  end if;

  insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
  values (old.trip_id, tg_table_name, old.id, now())
  on conflict (trip_id, table_name, row_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;

revoke all on function public.signal_trip_domain_delete() from public;
revoke all on function public.signal_trip_domain_delete() from anon;
revoke all on function public.signal_trip_domain_delete() from authenticated;

drop trigger if exists reservations_signal_realtime_delete on public.reservations;
create trigger reservations_signal_realtime_delete
  after delete on public.reservations
  for each row execute function public.signal_trip_domain_delete();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    execute 'alter publication supabase_realtime add table public.reservations';
  end if;
end $$;
