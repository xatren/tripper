-- RLS/grants contract assertions for public.itinerary_items.
-- Run in the Supabase SQL Editor after applying 20260716120000_itinerary_items.sql.
-- Every block raises an exception when the security contract is broken and is
-- silent when it holds. No data is created or modified.

-- 1. RLS is enabled and enforced on the table.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'itinerary_items' and c.relrowsecurity
  ) then
    raise exception 'itinerary_items must have row level security enabled';
  end if;
end $$;

-- 2. Exactly the four expected policies exist, with the membership helpers in
--    the right clauses.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'itinerary_items';
  if v_count <> 4 then
    raise exception 'itinerary_items expects exactly 4 policies, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'itinerary_items'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'SELECT policy must gate on is_trip_member';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'itinerary_items'
      and cmd = 'INSERT' and with_check like '%is_trip_editor%'
  ) then
    raise exception 'INSERT policy must gate on is_trip_editor via WITH CHECK';
  end if;

  -- UPDATE must carry BOTH USING and WITH CHECK on the editor helper.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'itinerary_items'
      and cmd = 'UPDATE'
      and qual like '%is_trip_editor%'
      and with_check like '%is_trip_editor%'
  ) then
    raise exception 'UPDATE policy must gate on is_trip_editor in USING and WITH CHECK';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'itinerary_items'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'DELETE policy must gate on is_trip_editor';
  end if;
end $$;

-- 3. anon holds no privileges; authenticated holds exactly CRUD.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'itinerary_items'
      and grantee = 'anon'
  ) then
    raise exception 'anon must hold no grants on itinerary_items';
  end if;

  if (
    select array_agg(privilege_type order by privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'itinerary_items'
      and grantee = 'authenticated'
  ) is distinct from array['DELETE', 'INSERT', 'SELECT', 'UPDATE'] then
    raise exception 'authenticated must hold exactly SELECT/INSERT/UPDATE/DELETE on itinerary_items';
  end if;
end $$;

-- 4. Delete-signal channel covers the table and the table is realtime-published.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.itinerary_items'::regclass
      and tgname = 'itinerary_items_signal_realtime_delete'
  ) then
    raise exception 'itinerary_items must signal deletes into trip_realtime_deletes';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'itinerary_items'
  ) then
    raise exception 'itinerary_items must be in the supabase_realtime publication';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trip_realtime_deletes'::regclass
      and conname = 'trip_realtime_deletes_table_name_check'
      and pg_get_constraintdef(oid) like '%itinerary_items%'
  ) then
    raise exception 'trip_realtime_deletes table_name check must allow itinerary_items';
  end if;
end $$;

-- 5. reorder_itinerary_day is executable only by authenticated users.
do $$
begin
  if not has_function_privilege('authenticated', 'public.reorder_itinerary_day(uuid, date, uuid[])', 'execute') then
    raise exception 'authenticated must be able to execute reorder_itinerary_day';
  end if;
  if has_function_privilege('anon', 'public.reorder_itinerary_day(uuid, date, uuid[])', 'execute') then
    raise exception 'anon must not execute reorder_itinerary_day';
  end if;
end $$;

select 'itinerary_items security contract holds' as result;
