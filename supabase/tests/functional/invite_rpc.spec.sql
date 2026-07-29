-- Functional RLS/RPC checks for invite-code joining (RM-002:
-- public.join_trip_by_invite + public.invite_join_attempts). Runs inside the
-- disposable transaction set up by run.mts, after _helpers.sql and
-- _fixtures.sql have created owner/editor/viewer/outsider/revoked and one
-- trip. Every block raises on violation.

-- 0. Only a trip member can read the invite code at all (covered fully by
--    trip_members.spec.sql; re-derive it here as postgres, the same way a
--    server-side test harness would, without relying on RLS visibility).
do $$ begin
  perform set_config(
    'tests.invite_code',
    (select invite_code from public.trips where id = current_setting('tests.trip_id')::uuid),
    true
  );
end $$;

-- 1. anon holds no EXECUTE grant on join_trip_by_invite at all — a fully
--    unauthenticated caller cannot even attempt a join.
select tests.authenticate_as_anon();
do $$ begin
  begin
    perform public.join_trip_by_invite(current_setting('tests.invite_code'));
    raise exception 'anon must not be able to execute join_trip_by_invite';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- 2. An outsider joining with the correct code becomes an editor member.
select tests.authenticate_as('outsider');
select public.join_trip_by_invite(current_setting('tests.invite_code'));
do $$ begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = current_setting('tests.trip_id')::uuid
      and user_id = tests.user_id('outsider') and role = 'editor'
  ) then
    raise exception 'a valid invite code must add the caller as an editor trip member';
  end if;
end $$;
-- The trip is now visible to them, same as any other member.
do $$ begin
  if (select count(*) from public.trips where id = current_setting('tests.trip_id')::uuid) <> 1 then
    raise exception 'joining via invite must grant immediate trip visibility';
  end if;
end $$;

-- 3. A previously-removed member ('revoked') can rejoin with a valid code —
--    revocation is not a permanent ban, just a membership removal.
select tests.authenticate_as('revoked');
select public.join_trip_by_invite(current_setting('tests.invite_code'));
do $$ begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = current_setting('tests.trip_id')::uuid and user_id = tests.user_id('revoked')
  ) then
    raise exception 'a removed member presenting a valid invite code must be able to rejoin';
  end if;
end $$;

-- 4. An invalid code returns outcome='invalid_code' (no trip_id) — the RPC
--    reports failure via its return value rather than raising, so the audit
--    insert below actually commits (see 20260728010000_invite_rate_limiting.sql
--    for why raising here would silently roll back that same insert).
select tests.authenticate_as('editor');
do $$
declare
  v_result jsonb;
begin
  v_result := public.join_trip_by_invite('NOTAREALCODE');
  if v_result->>'outcome' <> 'invalid_code' or v_result->>'trip_id' is not null then
    raise exception 'an invalid invite code must return outcome=invalid_code with no trip_id, got %', v_result;
  end if;
end $$;

-- Logged to the audit table (never a client-visible table — no grants at
-- all, RLS aside).
select tests.clear_authentication();
do $$ begin
  if not exists (
    select 1 from public.invite_join_attempts
    where attempted_code = 'NOTAREALCODE' and outcome = 'invalid_code'
  ) then
    raise exception 'an invalid-code attempt must be recorded in the audit table';
  end if;
end $$;

-- 5. invite_join_attempts has zero grants to anon/authenticated: even a
--    trip owner cannot read the audit log through the app-facing roles.
select tests.authenticate_as('owner');
do $$ begin
  begin
    perform count(*) from public.invite_join_attempts;
    raise exception 'invite_join_attempts must not be selectable by any authenticated user, including the trip owner';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

select tests.authenticate_as_anon();
do $$ begin
  begin
    perform count(*) from public.invite_join_attempts;
    raise exception 'invite_join_attempts must not be selectable by anon';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- 6. Rate limiting: after 8 attempts in the 10-minute window, a fresh user's
--    next attempt is rejected as rate_limited even though earlier attempts
--    only failed on an invalid code.
select tests.clear_authentication();
select tests.create_user('rate_limit_tester');
select tests.authenticate_as('rate_limit_tester');
do $$
declare
  i int;
  v_result jsonb;
begin
  for i in 1..8 loop
    v_result := public.join_trip_by_invite('STILLWRONG');
    if v_result->>'outcome' <> 'invalid_code' then
      raise exception 'attempt % inside the window should still be an ordinary invalid_code rejection, got %', i, v_result;
    end if;
  end loop;
end $$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.join_trip_by_invite('STILLWRONG');
  if v_result->>'outcome' <> 'rate_limited' then
    raise exception 'the 9th attempt inside the rate-limit window must return outcome=rate_limited, got %', v_result;
  end if;
end $$;

select tests.clear_authentication();
do $$ begin
  if not exists (
    select 1 from public.invite_join_attempts
    where user_id = tests.user_id('rate_limit_tester') and outcome = 'rate_limited'
  ) then
    raise exception 'a rate-limited attempt must be recorded in the audit table with outcome=rate_limited';
  end if;
end $$;

-- Rate limiting must hold even against the *correct* code once the caller
-- has exhausted their window — an attacker cannot "burn through" the limit
-- and then succeed on a lucky guess.
select tests.authenticate_as('rate_limit_tester');
do $$
declare
  v_result jsonb;
begin
  v_result := public.join_trip_by_invite(current_setting('tests.invite_code'));
  if v_result->>'outcome' <> 'rate_limited' then
    raise exception 'a rate-limited caller must be rejected even when presenting the correct invite code, got %', v_result;
  end if;
end $$;
do $$ begin
  if exists (
    select 1 from public.trip_members
    where trip_id = current_setting('tests.trip_id')::uuid and user_id = tests.user_id('rate_limit_tester')
  ) then
    raise exception 'a rate-limited caller must not have been added as a trip member';
  end if;
end $$;

select 'invite-code RLS/RPC contract holds' as result;
