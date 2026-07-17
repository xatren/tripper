-- RLS/grants/storage contract assertions for the Phase 7 bookings feature.
-- Run in the Supabase SQL Editor after applying 20260716233000_reservations.sql.
-- Every block raises an exception when the security contract is broken and is
-- silent when it holds. No data is created or modified.

-- 1. RLS is enabled on both tables.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reservations' and c.relrowsecurity
  ) then
    raise exception 'reservations must have row level security enabled';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reservation_attachments' and c.relrowsecurity
  ) then
    raise exception 'reservation_attachments must have row level security enabled';
  end if;
end $$;

-- 2. reservations: exactly four policies with the membership helpers in the
--    right clauses (member read; editor insert/update/delete, UPDATE carrying
--    both USING and WITH CHECK).
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'reservations';
  if v_count <> 4 then
    raise exception 'reservations expects exactly 4 policies, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservations'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'reservations SELECT policy must gate on is_trip_member';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservations'
      and cmd = 'INSERT' and with_check like '%is_trip_editor%'
  ) then
    raise exception 'reservations INSERT policy must gate on is_trip_editor via WITH CHECK';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservations'
      and cmd = 'UPDATE'
      and qual like '%is_trip_editor%'
      and with_check like '%is_trip_editor%'
  ) then
    raise exception 'reservations UPDATE policy must gate on is_trip_editor in USING and WITH CHECK';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservations'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'reservations DELETE policy must gate on is_trip_editor';
  end if;
end $$;

-- 3. reservation_attachments: exactly three policies (no UPDATE — rows are
--    immutable), all deriving trip authorization through the parent row.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'reservation_attachments';
  if v_count <> 3 then
    raise exception 'reservation_attachments expects exactly 3 policies, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_attachments'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'attachment SELECT policy must gate on is_trip_member via the parent reservation';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_attachments'
      and cmd = 'INSERT' and with_check like '%is_trip_editor%'
  ) then
    raise exception 'attachment INSERT policy must gate on is_trip_editor via WITH CHECK';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_attachments'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'attachment DELETE policy must gate on is_trip_editor';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_attachments'
      and cmd = 'UPDATE'
  ) then
    raise exception 'reservation_attachments must not carry an UPDATE policy (immutable rows)';
  end if;
end $$;

-- 4. anon holds no privileges; authenticated holds exactly the intended set.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('reservations', 'reservation_attachments')
      and grantee = 'anon'
  ) then
    raise exception 'anon must hold no grants on reservations tables';
  end if;

  if (
    select array_agg(privilege_type::text order by privilege_type::text)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'reservations'
      and grantee = 'authenticated'
  ) is distinct from array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[] then
    raise exception 'authenticated must hold exactly SELECT/INSERT/UPDATE/DELETE on reservations';
  end if;

  if (
    select array_agg(privilege_type::text order by privilege_type::text)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'reservation_attachments'
      and grantee = 'authenticated'
  ) is distinct from array['DELETE', 'INSERT', 'SELECT']::text[] then
    raise exception 'authenticated must hold exactly SELECT/INSERT/DELETE on reservation_attachments (no UPDATE)';
  end if;
end $$;

-- 5. FK delete behavior: trip cascade, itinerary link SET NULL, attachment
--    cascade, attribution SET NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and contype = 'f' and confdeltype = 'c'
      and pg_get_constraintdef(oid) like '%trips(id)%'
  ) then
    raise exception 'reservations.trip_id must cascade on trip delete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%itinerary_items(id)%'
  ) then
    raise exception 'reservations.itinerary_item_id must SET NULL when the plan item is deleted';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%profiles(id)%'
  ) then
    raise exception 'reservations.created_by must SET NULL on account deletion';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservation_attachments'::regclass
      and contype = 'f' and confdeltype = 'c'
      and pg_get_constraintdef(oid) like '%reservations(id)%'
  ) then
    raise exception 'reservation_attachments.reservation_id must cascade with its reservation';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservation_attachments'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%profiles(id)%'
  ) then
    raise exception 'reservation_attachments.uploaded_by must SET NULL on account deletion';
  end if;
end $$;

-- 6. Storage: bucket is private with the MIME allowlist and size limit, and
--    the four object policies are scoped to the bucket + membership helpers.
do $$
declare
  v_bucket record;
begin
  select public, file_size_limit, allowed_mime_types into v_bucket
  from storage.buckets where id = 'trip-documents';

  if v_bucket is null then
    raise exception 'trip-documents bucket must exist';
  end if;
  if v_bucket.public then
    raise exception 'trip-documents bucket must be private';
  end if;
  if v_bucket.file_size_limit is distinct from 20971520 then
    raise exception 'trip-documents bucket must enforce the 20 MiB size limit';
  end if;
  if v_bucket.allowed_mime_types is distinct from
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] then
    raise exception 'trip-documents bucket must enforce the PDF/JPEG/PNG/WebP allowlist';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Trip members can view trip documents'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'trip-documents SELECT policy must gate on is_trip_member';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Trip editors can upload trip documents'
      and cmd = 'INSERT'
      and with_check like '%is_trip_editor%'
      and with_check like '%reservations%'
  ) then
    raise exception 'trip-documents INSERT policy must gate on is_trip_editor and the reservations path prefix';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Trip editors can update trip documents'
      and cmd = 'UPDATE'
      and qual like '%is_trip_editor%'
      and with_check like '%is_trip_editor%'
  ) then
    raise exception 'trip-documents UPDATE policy must gate on is_trip_editor in USING and WITH CHECK';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Trip editors can delete trip documents'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'trip-documents DELETE policy must gate on is_trip_editor';
  end if;
end $$;

-- 7. Delete-signal channel covers reservations and the table is published.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.reservations'::regclass
      and tgname = 'reservations_signal_realtime_delete'
  ) then
    raise exception 'reservations must signal deletes into trip_realtime_deletes';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'reservations'
  ) then
    raise exception 'reservations must be in the supabase_realtime publication';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trip_realtime_deletes'::regclass
      and conname = 'trip_realtime_deletes_table_name_check'
      and pg_get_constraintdef(oid) like '%reservations%'
  ) then
    raise exception 'trip_realtime_deletes table_name check must allow reservations';
  end if;
end $$;

select 'reservations security contract holds' as result;
