-- Functional RLS/RPC checks for the shared abuse/rate-limit layer (RM-012:
-- public.check_rate_limit + public.rate_limit_events +
-- public.rate_limit_scope_config). Runs inside the disposable transaction
-- set up by run.mts, after _helpers.sql and _fixtures.sql. Every block
-- raises on violation.

-- 0. Seed an isolated test scope so this spec can't collide with the real
--    signup_ip/places_*_user rows seeded by the migration.
insert into public.rate_limit_scope_config (scope, limit_count, window_seconds, shadow_mode)
values ('test_enforced', 3, 3600, false), ('test_shadow', 3, 3600, true);

-- 1. anon holds no EXECUTE grant on check_rate_limit at all.
select tests.authenticate_as_anon();
do $$ begin
  begin
    perform public.check_rate_limit('test_enforced', 'anon-caller');
    raise exception 'anon must not be able to execute check_rate_limit';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- 2. An unrecognized scope fails open (never blocks unexpectedly on a typo).
select tests.authenticate_as('outsider');
do $$
declare
  v_result jsonb;
begin
  v_result := public.check_rate_limit('no_such_scope', 'anything');
  if (v_result->>'allowed')::boolean is not true then
    raise exception 'an unrecognized scope must fail open (allowed=true), got %', v_result;
  end if;
end $$;

-- 3. Under the limit: calls 1..3 for the same identity are all allowed and
--    logged with outcome='allowed'.
do $$
declare
  i int;
  v_result jsonb;
begin
  for i in 1..3 loop
    v_result := public.check_rate_limit('test_enforced', 'shared-identity');
    if (v_result->>'allowed')::boolean is not true then
      raise exception 'call % under the limit must be allowed, got %', i, v_result;
    end if;
  end loop;
end $$;
do $$ begin
  if (
    select count(*) from public.rate_limit_events
    where scope = 'test_enforced' and identity_key = 'shared-identity' and outcome = 'allowed'
  ) <> 3 then
    raise exception 'every allowed call must be logged with outcome=allowed';
  end if;
end $$;

-- 4. Over the limit (enforced scope): the 4th call is rejected and logged as
--    'blocked', with a positive retry_after_seconds.
do $$
declare
  v_result jsonb;
begin
  v_result := public.check_rate_limit('test_enforced', 'shared-identity');
  if (v_result->>'allowed')::boolean is not false or v_result->>'shadow_blocked' <> 'false' then
    raise exception 'the 4th call over an enforced limit must be rejected, got %', v_result;
  end if;
  if (v_result->>'retry_after_seconds')::int <= 0 then
    raise exception 'a rejected call must report a positive retry_after_seconds, got %', v_result;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from public.rate_limit_events
    where scope = 'test_enforced' and identity_key = 'shared-identity' and outcome = 'blocked'
  ) then
    raise exception 'a rejected call under an enforced scope must be logged with outcome=blocked';
  end if;
end $$;

-- 5. Shadow mode: once the identity is over the limit, check_rate_limit
--    still returns allowed=true (the caller is never actually blocked) but
--    records outcome='shadow_blocked' — this is what makes shadow mode
--    measurable without affecting real traffic.
do $$
declare
  i int;
  v_result jsonb;
begin
  for i in 1..3 loop
    v_result := public.check_rate_limit('test_shadow', 'shadow-identity');
  end loop;
  -- 4th call: over the limit, but shadow_mode=true.
  v_result := public.check_rate_limit('test_shadow', 'shadow-identity');
  if (v_result->>'allowed')::boolean is not true then
    raise exception 'a shadow-mode scope must always report allowed=true, got %', v_result;
  end if;
  if (v_result->>'shadow_blocked')::boolean is not true then
    raise exception 'a shadow-mode scope over its limit must report shadow_blocked=true, got %', v_result;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from public.rate_limit_events
    where scope = 'test_shadow' and identity_key = 'shadow-identity' and outcome = 'shadow_blocked'
  ) then
    raise exception 'a shadow-mode rejection must be logged with outcome=shadow_blocked';
  end if;
end $$;

-- 6. A different identity_key under the same scope has its own independent
--    counter (no cross-identity bleed).
do $$
declare
  v_result jsonb;
begin
  v_result := public.check_rate_limit('test_enforced', 'a-fresh-identity');
  if (v_result->>'allowed')::boolean is not true then
    raise exception 'a fresh identity_key must not inherit another identity''s exhausted quota, got %', v_result;
  end if;
end $$;

-- 7. rate_limit_events and rate_limit_scope_config have zero grants to
--    anon/authenticated, same lockdown as invite_join_attempts.
do $$ begin
  begin
    perform count(*) from public.rate_limit_events;
    raise exception 'rate_limit_events must not be selectable by authenticated users';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;
do $$ begin
  begin
    perform count(*) from public.rate_limit_scope_config;
    raise exception 'rate_limit_scope_config must not be selectable by authenticated users';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

select tests.authenticate_as_anon();
do $$ begin
  begin
    perform count(*) from public.rate_limit_events;
    raise exception 'rate_limit_events must not be selectable by anon';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

select 'shared rate-limit RLS/RPC contract holds' as result;
