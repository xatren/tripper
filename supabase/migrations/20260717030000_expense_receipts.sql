-- Private expense receipts (Phase 8), modeled line-for-line on
-- reservation_attachments (20260716233000_reservations.sql). Reuses the
-- existing private `trip-documents` bucket with a new path segment
-- (`{trip_id}/expenses/{expense_id}/{uuid}.{ext}`) rather than opening a
-- second bucket — same MIME/size contract, additive storage policies only.

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (length(trim(original_name)) > 0 and length(original_name) <= 255),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expense_receipts_expense_idx
  on public.expense_receipts (expense_id);
create index if not exists expense_receipts_uploaded_by_idx
  on public.expense_receipts (uploaded_by);

alter table public.expense_receipts enable row level security;

drop policy if exists "Trip members can view expense receipts" on public.expense_receipts;
drop policy if exists "Trip editors can insert expense receipts" on public.expense_receipts;
drop policy if exists "Trip editors can delete expense receipts" on public.expense_receipts;

create policy "Trip members can view expense receipts" on public.expense_receipts
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_receipts.expense_id
        and public.is_trip_member(e.trip_id)
    )
  );
create policy "Trip editors can insert expense receipts" on public.expense_receipts
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and public.is_trip_editor(e.trip_id)
    )
  );
create policy "Trip editors can delete expense receipts" on public.expense_receipts
  for delete using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_receipts.expense_id
        and public.is_trip_editor(e.trip_id)
    )
  );

-- Immutable rows (replace = delete + insert with a fresh uuid path) — no
-- UPDATE privilege, matching reservation_attachments.
revoke all on table public.expense_receipts from anon;
revoke all on table public.expense_receipts from authenticated;
grant select, insert, delete on table public.expense_receipts to authenticated;

-- ── Storage: additive policies on the existing trip-documents bucket ────────
-- These are new policies, not edits to the reservations ones — zero blast
-- radius on the already-shipped reservations feature. Bucket-level MIME
-- allowlist/size limit already match (set by the reservations migration).
drop policy if exists "Trip editors can upload expense receipts" on storage.objects;
drop policy if exists "Trip editors can delete expense receipts" on storage.objects;

create policy "Trip editors can upload expense receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-documents'
    and (storage.foldername(name))[2] = 'expenses'
    and exists (
      select 1 from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

create policy "Trip editors can delete expense receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and (storage.foldername(name))[2] = 'expenses'
    and exists (
      select 1 from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

-- The existing "Trip members can view trip documents" SELECT policy
-- (20260716233000_reservations.sql) is bucket-wide with no path-segment
-- check, so expense receipts are already readable by trip members through it
-- — no new SELECT storage policy needed here.
