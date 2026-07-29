-- Contract assertions for RM-002 (20260728010000_invite_rate_limiting.sql).
-- Run in the Supabase SQL Editor after applying that migration. Every block
-- raises an exception when the security contract is broken and is silent
-- when it holds. No data is created or modified. Modeled section-for-section
-- on rm001_finance_invariants_assertions.sql.

-- 1. invite_join_attempts exists, has RLS enabled, and is fully locked down
--    (server-side audit trail only, no client grants at all).
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'invite_join_attempts' and c.relrowsecurity
  ) then
    raise exception 'invite_join_attempts must have row level security enabled';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'invite_join_attempts'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'invite_join_attempts must hold no grants for anon or authenticated';
  end if;
end $$;

-- 2. join_trip_by_invite has been replaced with the (text, inet) signature;
--    the old one-arg overload must be gone to avoid ambiguous-call errors.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'join_trip_by_invite'
      and p.pronargs = 1
      and p.proargtypes[0] = 'text'::regtype
  ) then
    raise exception 'the old single-argument join_trip_by_invite(text) must be dropped';
  end if;

  if not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'join_trip_by_invite'
      and grantee = 'authenticated'
  ) then
    raise exception 'join_trip_by_invite must be executable by authenticated';
  end if;
end $$;

-- 3. join_trip_by_invite uses an empty search_path. Rotation
--    (rotate_trip_invite) already exists and is covered by
--    tests/collaboration-security.test.mts — not re-asserted here.
do $$
declare
  v_fn text;
  v_missing text[] := array[]::text[];
begin
  foreach v_fn in array array[
    'join_trip_by_invite(text,inet)'
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

select 'RM-002 invite abuse protection contract holds' as result;
