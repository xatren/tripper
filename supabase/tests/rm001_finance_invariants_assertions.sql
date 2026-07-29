-- Contract assertions for RM-001 (20260728000000_settlement_finance_invariants.sql).
-- Run in the Supabase SQL Editor after applying that migration. Every block
-- raises an exception when the security contract is broken and is silent
-- when it holds. No data is created or modified. Modeled section-for-section
-- on expenses_settlements_rls_assertions.sql.

-- 1. Settlement membership/amount-bound trigger exists on INSERT.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.settlements'::regclass
      and tgname = 'settlements_validate_invariants'
      and tgtype & 1 = 1 -- row-level
  ) then
    raise exception 'settlements must carry the settlements_validate_invariants BEFORE INSERT trigger';
  end if;
end $$;

-- 2. CHECK constraints exist (may be NOT VALID if pre-existing dirty data
--    blocked validation — the constraint still gates all new writes).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_amount_non_negative'
      and contype = 'c'
  ) then
    raise exception 'expenses must carry the expenses_amount_non_negative CHECK constraint';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.settlements'::regclass
      and conname = 'settlements_distinct_parties'
      and contype = 'c'
  ) then
    raise exception 'settlements must carry the settlements_distinct_parties CHECK constraint';
  end if;
end $$;

-- 3. Settlement/expense RPCs and their membership-helper dependencies use an
--    empty search_path (not `public`), closing the search_path-hijack class
--    of risk on every SECURITY DEFINER function in this call graph.
do $$
declare
  v_fn text;
  v_missing text[] := array[]::text[];
begin
  foreach v_fn in array array[
    'record_settlement_payment(uuid,uuid,uuid,integer,uuid,text)',
    'reopen_settlement(uuid)',
    'save_expense_with_splits(uuid,uuid,text,text,numeric,uuid,date,uuid,text,jsonb)',
    'signal_trip_domain_delete()',
    'signal_expense_split_delete()',
    'is_trip_member(uuid)',
    'is_trip_editor(uuid)',
    'is_trip_owner(uuid)',
    'add_trip_owner_membership()',
    'validate_settlement_invariants()'
  ]
  loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid = ('public.' || v_fn)::regprocedure
        and exists (
          select 1 from unnest(p.proconfig) as cfg
          where cfg = 'search_path=""'
        )
    ) then
      v_missing := array_append(v_missing, v_fn);
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception 'these functions must set an empty search_path: %', array_to_string(v_missing, ', ');
  end if;
end $$;

select 'RM-001 finance invariants contract holds' as result;
