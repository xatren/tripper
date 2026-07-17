-- RLS/grants/storage contract assertions for the Phase 8 expense splits,
-- settlements, and receipts feature. Run in the Supabase SQL Editor after
-- applying 20260717010000_expense_splits.sql, 20260717020000_settlements.sql,
-- and 20260717030000_expense_receipts.sql. Every block raises an exception
-- when the security contract is broken and is silent when it holds. No data
-- is created or modified. Modeled section-for-section on
-- reservations_rls_assertions.sql.

-- 1. RLS is enabled on all three new tables.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'expense_splits' and c.relrowsecurity
  ) then
    raise exception 'expense_splits must have row level security enabled';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'settlements' and c.relrowsecurity
  ) then
    raise exception 'settlements must have row level security enabled';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'expense_receipts' and c.relrowsecurity
  ) then
    raise exception 'expense_receipts must have row level security enabled';
  end if;
end $$;

-- 2. expense_splits: exactly one policy (member read via the parent expense).
--    All writes go through save_expense_with_splits, not direct grants.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'expense_splits';
  if v_count <> 1 then
    raise exception 'expense_splits expects exactly 1 policy, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expense_splits'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'expense_splits SELECT policy must gate on is_trip_member via the parent expense';
  end if;
end $$;

-- 3. settlements: exactly one policy (member read). Mutations go through
--    record_settlement_payment/reopen_settlement, not direct grants.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'settlements';
  if v_count <> 1 then
    raise exception 'settlements expects exactly 1 policy, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'settlements'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'settlements SELECT policy must gate on is_trip_member';
  end if;
end $$;

-- 4. expense_receipts: exactly three policies (no UPDATE — immutable rows),
--    all deriving trip authorization through the parent expense.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'expense_receipts';
  if v_count <> 3 then
    raise exception 'expense_receipts expects exactly 3 policies, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expense_receipts'
      and cmd = 'SELECT' and qual like '%is_trip_member%'
  ) then
    raise exception 'expense_receipts SELECT policy must gate on is_trip_member via the parent expense';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expense_receipts'
      and cmd = 'INSERT' and with_check like '%is_trip_editor%'
  ) then
    raise exception 'expense_receipts INSERT policy must gate on is_trip_editor via WITH CHECK';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expense_receipts'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'expense_receipts DELETE policy must gate on is_trip_editor';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expense_receipts'
      and cmd = 'UPDATE'
  ) then
    raise exception 'expense_receipts must not carry an UPDATE policy (immutable rows)';
  end if;
end $$;

-- 5. anon holds no privileges on any of the three tables; authenticated
--    holds exactly the narrow intended set (RPC-only writes for splits and
--    settlements — no direct INSERT/UPDATE grant).
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('expense_splits', 'settlements', 'expense_receipts')
      and grantee = 'anon'
  ) then
    raise exception 'anon must hold no grants on the expense splits/settlements/receipts tables';
  end if;

  if (
    select array_agg(privilege_type::text order by privilege_type::text)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'expense_splits'
      and grantee = 'authenticated'
  ) is distinct from array['SELECT']::text[] then
    raise exception 'authenticated must hold exactly SELECT on expense_splits (writes go through save_expense_with_splits)';
  end if;

  if (
    select array_agg(privilege_type::text order by privilege_type::text)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'settlements'
      and grantee = 'authenticated'
  ) is distinct from array['SELECT']::text[] then
    raise exception 'authenticated must hold exactly SELECT on settlements (mutations go through the settlement RPCs)';
  end if;

  if (
    select array_agg(privilege_type::text order by privilege_type::text)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'expense_receipts'
      and grantee = 'authenticated'
  ) is distinct from array['DELETE', 'INSERT', 'SELECT']::text[] then
    raise exception 'authenticated must hold exactly SELECT/INSERT/DELETE on expense_receipts (no UPDATE)';
  end if;
end $$;

-- 6. FK delete behavior: cascades follow the parent row; attribution columns
--    SET NULL on account deletion, matching expenses.paid_by's contract.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expense_splits'::regclass
      and contype = 'f' and confdeltype = 'c'
      and pg_get_constraintdef(oid) like '%expenses(id)%'
  ) then
    raise exception 'expense_splits.expense_id must cascade with its expense';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expense_splits'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%profiles(id)%'
  ) then
    raise exception 'expense_splits.member_id must SET NULL on account deletion';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.settlements'::regclass
      and contype = 'f' and confdeltype = 'c'
      and pg_get_constraintdef(oid) like '%trips(id)%'
  ) then
    raise exception 'settlements.trip_id must cascade on trip delete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expense_receipts'::regclass
      and contype = 'f' and confdeltype = 'c'
      and pg_get_constraintdef(oid) like '%expenses(id)%'
  ) then
    raise exception 'expense_receipts.expense_id must cascade with its expense';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expense_receipts'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%profiles(id)%'
  ) then
    raise exception 'expense_receipts.uploaded_by must SET NULL on account deletion';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%itinerary_items(id)%'
  ) then
    raise exception 'expenses.itinerary_item_id must SET NULL when the linked plan item is deleted';
  end if;
end $$;

-- 7. RPCs are executable only by authenticated, not public/anon — the sole
--    sanctioned write path for splits and settlement mutations.
do $$
begin
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'save_expense_with_splits' and grantee = 'PUBLIC'
  ) then
    raise exception 'save_expense_with_splits must not be executable by PUBLIC';
  end if;
  if not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'save_expense_with_splits' and grantee = 'authenticated'
  ) then
    raise exception 'save_expense_with_splits must be executable by authenticated';
  end if;

  if not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'record_settlement_payment' and grantee = 'authenticated'
  ) then
    raise exception 'record_settlement_payment must be executable by authenticated';
  end if;

  if not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'reopen_settlement' and grantee = 'authenticated'
  ) then
    raise exception 'reopen_settlement must be executable by authenticated';
  end if;
end $$;

-- 8. Idempotency backstop: settlements carries a unique(trip_id, idempotency_key).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.settlements'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%trip_id%' and pg_get_constraintdef(oid) like '%idempotency_key%'
  ) then
    raise exception 'settlements must carry a unique(trip_id, idempotency_key) constraint';
  end if;
end $$;

-- 9. Storage: the new 'expenses' path segment has its own additive upload/
--    delete policies on the shared trip-documents bucket, gated the same way
--    as the existing reservations policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Trip editors can upload expense receipts'
      and cmd = 'INSERT'
      and with_check like '%is_trip_editor%'
      and with_check like '%expenses%'
  ) then
    raise exception 'trip-documents INSERT policy for expense receipts must gate on is_trip_editor and the expenses path prefix';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Trip editors can delete expense receipts'
      and cmd = 'DELETE' and qual like '%is_trip_editor%'
  ) then
    raise exception 'trip-documents DELETE policy for expense receipts must gate on is_trip_editor';
  end if;
end $$;

-- 10. Delete-signal channel covers expense_splits and settlements, and both
--     tables are published for realtime.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.expense_splits'::regclass
      and tgname = 'expense_splits_signal_realtime_delete'
  ) then
    raise exception 'expense_splits must signal deletes into trip_realtime_deletes';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.settlements'::regclass
      and tgname = 'settlements_signal_realtime_delete'
  ) then
    raise exception 'settlements must signal deletes into trip_realtime_deletes';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'expense_splits'
  ) then
    raise exception 'expense_splits must be in the supabase_realtime publication';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'settlements'
  ) then
    raise exception 'settlements must be in the supabase_realtime publication';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trip_realtime_deletes'::regclass
      and conname = 'trip_realtime_deletes_table_name_check'
      and pg_get_constraintdef(oid) like '%expense_splits%'
      and pg_get_constraintdef(oid) like '%settlements%'
  ) then
    raise exception 'trip_realtime_deletes table_name check must allow expense_splits and settlements';
  end if;
end $$;

select 'expenses/settlements/receipts security contract holds' as result;
