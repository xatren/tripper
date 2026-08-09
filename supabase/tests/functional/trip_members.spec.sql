-- Functional RLS/RPC checks for trip membership (public.trips,
-- public.trip_members, public.manage_trip_member). Runs inside the
-- disposable transaction set up by run.mts, after _helpers.sql and
-- _fixtures.sql have created owner/editor/viewer/outsider/revoked and one
-- trip. Every block raises on violation and is silent when the contract
-- holds — no data is left behind (the whole transaction rolls back).

-- 1. Trip visibility: current members see it, outsider and a removed member
--    don't (RLS filters the row out rather than erroring).
select tests.authenticate_as('owner');
do $$ begin
  if (select count(*) from public.trips where id = current_setting('tests.trip_id')::uuid) <> 1 then
    raise exception 'owner must see the trip';
  end if;
end $$;

select tests.authenticate_as('editor');
do $$ begin
  if (select count(*) from public.trips where id = current_setting('tests.trip_id')::uuid) <> 1 then
    raise exception 'editor must see the trip';
  end if;
end $$;

select tests.authenticate_as('viewer');
do $$ begin
  if (select count(*) from public.trips where id = current_setting('tests.trip_id')::uuid) <> 1 then
    raise exception 'viewer must see the trip';
  end if;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  if (select count(*) from public.trips where id = current_setting('tests.trip_id')::uuid) <> 0 then
    raise exception 'outsider must not see a trip they were never invited to';
  end if;
end $$;

select tests.authenticate_as('revoked');
do $$ begin
  if (select count(*) from public.trips where id = current_setting('tests.trip_id')::uuid) <> 0 then
    raise exception 'a removed member must lose visibility into the trip immediately';
  end if;
end $$;

-- 2. trip_members visibility follows the same membership gate.
select tests.authenticate_as('viewer');
do $$ begin
  if (select count(*) from public.trip_members where trip_id = current_setting('tests.trip_id')::uuid) <> 3 then
    raise exception 'a current member must see all 3 active trip_members rows (owner/editor/viewer)';
  end if;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  if (select count(*) from public.trip_members where trip_id = current_setting('tests.trip_id')::uuid) <> 0 then
    raise exception 'outsider must not see any trip_members rows for a trip they are not on';
  end if;
end $$;

-- 3. Direct DML on trip_members is blocked for every authenticated user,
--    including the owner — the only sanctioned write path is
--    manage_trip_member (revoked in 20260717230803_trip_collaboration.sql:
--    "revoke insert, update, delete on public.trip_members from authenticated").
select tests.authenticate_as('owner');
do $$ begin
  begin
    insert into public.trip_members (trip_id, user_id, role)
    values (current_setting('tests.trip_id')::uuid, tests.user_id('outsider'), 'viewer');
    raise exception 'owner must not be able to add members via a direct INSERT (bypasses manage_trip_member)';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    update public.trip_members set role = 'owner'
    where trip_id = current_setting('tests.trip_id')::uuid and user_id = tests.user_id('viewer');
    raise exception 'owner must not be able to change roles via a direct UPDATE (bypasses manage_trip_member)';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    delete from public.trip_members
    where trip_id = current_setting('tests.trip_id')::uuid and user_id = tests.user_id('viewer');
    raise exception 'owner must not be able to remove members via a direct DELETE (bypasses manage_trip_member)';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- 4. manage_trip_member: only a current owner may call it.
select tests.authenticate_as('editor');
do $$ begin
  begin
    perform public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('viewer'), 'remove', null);
    raise exception 'a non-owner editor must not be able to remove a member';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('viewer');
do $$ begin
  begin
    perform public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('editor'), 'set_role', 'owner');
    raise exception 'a viewer must not be able to promote anyone, including themselves, to owner';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  begin
    perform public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('viewer'), 'remove', null);
    raise exception 'an outsider must not be able to call manage_trip_member on a trip they are not a member of';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('revoked');
do $$ begin
  begin
    perform public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('viewer'), 'remove', null);
    raise exception 'a removed member must not retain any manage_trip_member authority on their former trip';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- 5. Last-owner invariant: the sole owner cannot demote or remove themselves,
--    which would otherwise leave the trip ownerless.
select tests.authenticate_as('owner');
do $$ begin
  begin
    perform public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('owner'), 'remove', null);
    raise exception 'the last owner must not be removable';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    perform public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('owner'), 'set_role', 'editor');
    raise exception 'the last owner must not be demotable';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- 6. A legitimate owner action still works: promoting the viewer to editor.
select public.manage_trip_member(current_setting('tests.trip_id')::uuid, tests.user_id('viewer'), 'set_role', 'editor');
do $$ begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = current_setting('tests.trip_id')::uuid
      and user_id = tests.user_id('viewer')
      and role = 'editor'
  ) then
    raise exception 'owner-issued manage_trip_member(set_role) must actually apply';
  end if;
end $$;

-- 7. The revoke performed in _fixtures.sql (through this same RPC) actually
--    took effect: no lingering trip_members row for 'revoked'.
do $$ begin
  if exists (
    select 1 from public.trip_members
    where trip_id = current_setting('tests.trip_id')::uuid and user_id = tests.user_id('revoked')
  ) then
    raise exception 'a removed member must have no trip_members row left behind';
  end if;
end $$;

-- 8. Deleting a trip must not let cascading trip_members triggers recreate
--    child activity rows for the parent that is being removed.
do $$
declare
  -- Pre-generated rather than captured via RETURNING: RETURNING re-checks
  -- the row against the SELECT policy (is_trip_member) immediately after
  -- the insert, which runs before the AFTER INSERT trigger has added the
  -- owner's trip_members row for it — so a same-statement RETURNING would
  -- spuriously fail RLS even though the insert itself is legitimate.
  disposable_trip_id uuid := gen_random_uuid();
begin
  insert into public.trips (id, owner_id, title)
  values (disposable_trip_id, tests.user_id('owner'), 'Cascade deletion probe');

  delete from public.trips where id = disposable_trip_id;

  if exists (select 1 from public.trips where id = disposable_trip_id) then
    raise exception 'owner must be able to delete a trip with membership activity triggers enabled';
  end if;
end $$;

select 'trip membership RLS/RPC contract holds' as result;
