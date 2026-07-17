-- RLS/grants/realtime contract assertions for Phase 10 (Trip Readiness).
-- Run in the Supabase SQL Editor after applying
-- 20260717040000_trip_readiness.sql. Every block raises an exception when the
-- security contract is broken and is silent when it holds. No data is created
-- or modified. Modeled section-for-section on the other *_rls_assertions files.

-- 1. RLS is enabled on trip_tasks.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'trip_tasks' and c.relrowsecurity
  ) then
    raise exception 'trip_tasks must have row level security enabled';
  end if;
end $$;

-- 2. trip_tasks: member read, editor-only mutate (viewer denial).
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'trip_tasks';
  if v_count <> 4 then
    raise exception 'trip_tasks expects exactly 4 policies, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_tasks'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'trip_tasks SELECT policy must gate on is_trip_member';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_tasks'
      and cmd = 'INSERT' and with_check like '%is_trip_editor%'
  ) then
    raise exception 'trip_tasks INSERT policy must gate on is_trip_editor';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_tasks'
      and cmd = 'UPDATE' and qual like '%is_trip_editor%' and with_check like '%is_trip_editor%'
  ) then
    raise exception 'trip_tasks UPDATE policy must gate on is_trip_editor in both directions';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_tasks'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'trip_tasks DELETE policy must gate on is_trip_editor';
  end if;
end $$;

-- 3. Grants: anon has nothing; authenticated has exactly select/insert/update/delete.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'trip_tasks' and grantee = 'anon'
  ) then
    raise exception 'anon must hold no grants on trip_tasks';
  end if;

  if (
    select count(distinct privilege_type) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'trip_tasks' and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) <> 4 then
    raise exception 'authenticated must hold select/insert/update/delete on trip_tasks';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'trip_tasks' and grantee = 'authenticated'
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'authenticated must not hold structural privileges on trip_tasks';
  end if;
end $$;

-- 4. packing_items gained the Phase 10 collaboration columns.
do $$
declare
  missing text;
begin
  select string_agg(col, ', ') into missing
  from unnest(array[
    'assigned_to', 'quantity', 'priority', 'due_date', 'scope',
    'completed_by', 'completed_at', 'notes', 'order_index', 'updated_at'
  ]) as required(col)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'packing_items' and column_name = required.col
  );
  if missing is not null then
    raise exception 'packing_items is missing Phase 10 columns: %', missing;
  end if;
end $$;

-- 5. Realtime: trip_tasks is published and wired into the delete-signal contract.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_tasks'
  ) then
    raise exception 'trip_tasks must be in the supabase_realtime publication';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'trip_tasks'
      and t.tgname = 'trip_tasks_signal_realtime_delete' and not t.tgisinternal
  ) then
    raise exception 'trip_tasks must signal deletes through trip_tasks_signal_realtime_delete';
  end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'trip_realtime_deletes'
      and con.conname = 'trip_realtime_deletes_table_name_check'
      and pg_get_constraintdef(con.oid) like '%trip_tasks%'
  ) then
    raise exception 'trip_realtime_deletes table_name check must allow trip_tasks';
  end if;
end $$;

select 'trip_tasks RLS assertions passed' as result;
