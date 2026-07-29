-- Shared fixtures for the functional security suite: five users occupying
-- every role this suite cares about, one trip, and the storage buckets the
-- app depends on existing (created manually via the Studio/dashboard in real
-- environments — recreated here since a disposable stack starts empty).
--
--   owner     trip_members.role = 'owner'    (created the trip)
--   editor    trip_members.role = 'editor'   (co-planner)
--   viewer    trip_members.role = 'viewer'   (read-only collaborator)
--   outsider  never a trip_members row       (no relationship to the trip)
--   revoked   was 'editor', removed by the owner through the real
--             manage_trip_member RPC — exercises the actual revoke path
--             instead of a raw DELETE, so what's tested is what production
--             actually does when an owner removes someone.
--
-- Runs as the connection's login role (postgres — superuser, bypasses RLS),
-- which is the correct role for fixture setup: real end-user writes are
-- covered by the specs themselves, not by how the fixtures get seeded.

select tests.create_user('owner');
select tests.create_user('editor');
select tests.create_user('viewer');
select tests.create_user('outsider');
select tests.create_user('revoked');

insert into storage.buckets (id, name, public)
values
  ('trip-photos', 'trip-photos', false),
  ('trip-documents', 'trip-documents', false)
on conflict (id) do nothing;

do $$
declare
  v_trip_id uuid;
begin
  insert into public.trips (owner_id, title)
  values (tests.user_id('owner'), 'Fixture Trip')
  returning id into v_trip_id;
  -- trips_add_owner_membership (012_trip_members_authorization.sql) already
  -- added the owner's trip_members row via trigger.

  insert into public.trip_members (trip_id, user_id, role) values
    (v_trip_id, tests.user_id('editor'), 'editor'),
    (v_trip_id, tests.user_id('viewer'), 'viewer'),
    (v_trip_id, tests.user_id('revoked'), 'editor');

  perform set_config('tests.trip_id', v_trip_id::text, true);
end $$;

-- Revoke 'revoked' through the real app RPC (owner-only, last-owner-safe),
-- not a bare DELETE, so the fixture matches what actually runs in production.
select tests.authenticate_as('owner');
select public.manage_trip_member(
  current_setting('tests.trip_id')::uuid,
  tests.user_id('revoked'),
  'remove',
  null
);
select tests.clear_authentication();

-- One expense with real splits across the three current members, created
-- through the real write path (save_expense_with_splits) so its invariants
-- (sum-of-splits, current-membership) hold the same way they would in prod.
select tests.authenticate_as('editor');
do $$
declare
  v_trip_id uuid := current_setting('tests.trip_id')::uuid;
  v_result jsonb;
begin
  v_result := public.save_expense_with_splits(
    v_trip_id,
    null,
    'food',
    'Fixture group dinner',
    300.00,
    tests.user_id('editor'),
    current_date,
    null,
    'equal',
    jsonb_build_array(
      jsonb_build_object('member_id', tests.user_id('owner'), 'share_value', null, 'share_amount_minor', 10000),
      jsonb_build_object('member_id', tests.user_id('editor'), 'share_value', null, 'share_amount_minor', 10000),
      jsonb_build_object('member_id', tests.user_id('viewer'), 'share_value', null, 'share_amount_minor', 10000)
    )
  );
  perform set_config('tests.expense_id', v_result->'expense'->>'id', true);
end $$;
select tests.clear_authentication();
