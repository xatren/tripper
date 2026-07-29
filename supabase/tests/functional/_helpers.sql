-- Impersonation helpers for the functional security suite. Loaded fresh at
-- the start of every disposable transaction by run.mts (never committed —
-- every spec file runs inside BEGIN … ROLLBACK against a throwaway local
-- Supabase stack). Mirrors what PostgREST actually does per request: switch
-- the real Postgres role so table GRANTs apply, and set the `request.jwt.claims`
-- GUC so `auth.uid()`/`auth.role()` resolve exactly like a live API call.

create schema if not exists tests;
-- A newly created schema grants USAGE only to its owner (postgres) by
-- default. Every spec calls tests.* functions while impersonating
-- authenticated/anon, so both need USAGE to even resolve the call.
grant usage on schema tests to authenticated, anon;

-- Inserts a minimal but valid auth.users row and lets the existing
-- handle_new_user trigger create the matching public.profiles row, the same
-- as a real signup. `identifier` (owner/editor/viewer/outsider/revoked) is
-- stashed in raw_user_meta_data so later steps can look the user back up by
-- role name instead of juggling uuids.
create or replace function tests.create_user(identifier text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := identifier || '.' || substr(v_id::text, 1, 8) || '@security-tests.local';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email,
    -- Never used to authenticate through GoTrue (we impersonate directly at
    -- the Postgres level below), so the hash only needs to satisfy NOT NULL.
    '$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVabcdefgh',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('test_identifier', identifier, 'display_name', identifier),
    now(), now(), '', '', '', ''
  );
  return v_id;
end;
$$;

-- SECURITY DEFINER: called mid-spec while the session may already be
-- impersonating a low-privilege `authenticated`/`anon` role that has no
-- grants on auth.users, so lookups must run with the function owner's
-- (postgres) privileges rather than the caller's.
create or replace function tests.user_id(identifier text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where raw_user_meta_data->>'test_identifier' = identifier;
$$;

-- Switches the session to a real `authenticated` Postgres role (so RLS
-- policies scoped `to authenticated` and table GRANTs both apply) and sets
-- request.jwt.claims so auth.uid()/auth.jwt() resolve to this fixture user,
-- exactly as they would for a real end-user request through PostgREST.
--
-- Deliberately NOT security definer: Postgres refuses SET ROLE/SET LOCAL
-- ROLE inside a security-definer function body ("cannot set parameter
-- 'role' within security-definer function"). Instead this resets to the
-- connection's login role (postgres — superuser, bypasses RLS/grants) as
-- its very first step, which is always permitted regardless of whatever
-- role the session was previously impersonating; every following statement
-- in this function then runs with that privilege.
create or replace function tests.authenticate_as(identifier text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
begin
  reset role;

  v_id := tests.user_id(identifier);
  if v_id is null then
    raise exception 'tests.authenticate_as: no fixture user registered as "%"', identifier;
  end if;
  select email into v_email from auth.users where id = v_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_id::text,
    'email', v_email,
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
end;
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  -- Same reset-first reasoning as tests.authenticate_as: this can be called
  -- while already impersonating 'authenticated', which has no membership
  -- allowing a direct switch to 'anon'.
  reset role;
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Drops back to the transaction's login role (postgres), which owns every
-- table and bypasses RLS — used between fixture-setup steps that need
-- unrestricted writes (e.g. seeding a second user's row) and before handing
-- control to the next authenticate_as call.
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- Convenience wrapper: run `sql` as `identifier` and expect it to fail. Used
-- throughout the specs so a denial assertion reads as one line instead of a
-- four-line begin/exception block. Anything other than the expected error
-- class (RLS denial, explicit RAISE, insufficient_privilege) still fails the
-- surrounding test, so a query that unexpectedly succeeds is caught too.
create or replace function tests.assert_denied(identifier text, sql text, expectation text)
returns void
language plpgsql
as $$
begin
  perform tests.authenticate_as(identifier);
  begin
    execute sql;
    raise exception 'expected denial for %, but the statement succeeded: %', identifier, expectation;
  exception
    when raise_exception or insufficient_privilege or check_violation or no_data_found then
      null; -- expected: access was denied
  end;
  perform tests.clear_authentication();
end;
$$;
