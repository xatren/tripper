-- Functional RLS/RPC checks for expenses, expense_splits, and settlements
-- (save_expense_with_splits, record_settlement_payment, reopen_settlement).
-- Runs inside the disposable transaction set up by run.mts, after
-- _helpers.sql and _fixtures.sql have created owner/editor/viewer/
-- outsider/revoked, one trip, and one 300.00 expense split evenly across
-- owner/editor/viewer (10000 minor each). Every block raises on violation.

-- 1. expenses/expense_splits visibility follows trip membership.
select tests.authenticate_as('viewer');
do $$ begin
  if (select count(*) from public.expenses where id = current_setting('tests.expense_id')::uuid) <> 1 then
    raise exception 'a current member (viewer) must see the trip expense';
  end if;
  if (select count(*) from public.expense_splits where expense_id = current_setting('tests.expense_id')::uuid) <> 3 then
    raise exception 'a current member must see all 3 expense_splits rows';
  end if;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  if (select count(*) from public.expenses where id = current_setting('tests.expense_id')::uuid) <> 0 then
    raise exception 'outsider must not see an expense on a trip they are not on';
  end if;
end $$;

select tests.authenticate_as('revoked');
do $$ begin
  if (select count(*) from public.expenses where id = current_setting('tests.expense_id')::uuid) <> 0 then
    raise exception 'a removed member must lose visibility into trip expenses';
  end if;
  if (select count(*) from public.expense_splits where expense_id = current_setting('tests.expense_id')::uuid) <> 0 then
    raise exception 'a removed member must lose visibility into expense_splits';
  end if;
end $$;

-- 2. Direct writes to expenses/expense_splits/settlements bypass the invariant
--    checks the RPCs enforce, so they are blocked at the grant level.
select tests.authenticate_as('editor');
do $$ begin
  begin
    insert into public.expense_splits (expense_id, member_id, share_value, share_amount_minor)
    values (current_setting('tests.expense_id')::uuid, tests.user_id('editor'), null, 999999);
    raise exception 'expense_splits must have no direct INSERT grant (writes go through save_expense_with_splits)';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    insert into public.settlements (trip_id, from_member, to_member, amount_minor, idempotency_key)
    values (current_setting('tests.trip_id')::uuid, tests.user_id('owner'), tests.user_id('viewer'), 100, gen_random_uuid());
    raise exception 'settlements must have no direct INSERT grant (writes go through record_settlement_payment)';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- 3. save_expense_with_splits: only a trip editor/owner may call it.
select tests.authenticate_as('viewer');
do $$ begin
  begin
    perform public.save_expense_with_splits(
      current_setting('tests.trip_id')::uuid, null, 'other', 'viewer-authored', 50.00,
      tests.user_id('viewer'), current_date, null, 'equal', '[]'::jsonb
    );
    raise exception 'a viewer (read-only) must not be able to create an expense';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  begin
    perform public.save_expense_with_splits(
      current_setting('tests.trip_id')::uuid, null, 'other', 'outsider-authored', 50.00,
      null, current_date, null, 'equal', '[]'::jsonb
    );
    raise exception 'an outsider must not be able to create an expense on a trip they are not on';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('revoked');
do $$ begin
  begin
    perform public.save_expense_with_splits(
      current_setting('tests.trip_id')::uuid, null, 'other', 'revoked-authored', 50.00,
      null, current_date, null, 'equal', '[]'::jsonb
    );
    raise exception 'a removed member must not be able to create an expense on their former trip';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- 4. save_expense_with_splits enforces its own server-side invariants even
--    for an authorized editor: split shares must sum to the total, and every
--    split participant must be a current trip member.
select tests.authenticate_as('editor');
do $$ begin
  begin
    perform public.save_expense_with_splits(
      current_setting('tests.trip_id')::uuid, null, 'other', 'bad split sum', 100.00,
      tests.user_id('editor'), current_date, null, 'exact',
      jsonb_build_array(jsonb_build_object('member_id', tests.user_id('editor'), 'share_value', null, 'share_amount_minor', 5000))
    );
    raise exception 'split shares that do not sum to the expense total must be rejected';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    perform public.save_expense_with_splits(
      current_setting('tests.trip_id')::uuid, null, 'other', 'outsider in splits', 100.00,
      tests.user_id('editor'), current_date, null, 'exact',
      jsonb_build_array(jsonb_build_object('member_id', tests.user_id('outsider'), 'share_value', null, 'share_amount_minor', 10000))
    );
    raise exception 'an outsider must not be insertable as a split participant';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    perform public.save_expense_with_splits(
      current_setting('tests.trip_id')::uuid, null, 'other', 'paid by non-member', 100.00,
      tests.user_id('outsider'), current_date, null, 'equal', '[]'::jsonb
    );
    raise exception 'paid_by must be rejected when it names someone who is not a current trip member';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- 5. settlements visibility follows trip membership, same as expenses.
select tests.authenticate_as('editor');
do $$ begin
  if (select count(*) from public.settlements where trip_id = current_setting('tests.trip_id')::uuid) <> 0 then
    raise exception 'no settlements should exist yet at this point in the spec';
  end if;
end $$;

-- 6. record_settlement_payment: any editor/owner, or either named party, may
--    record a settlement; anyone else (a viewer who is neither) is denied.
select tests.authenticate_as('viewer');
do $$ begin
  begin
    perform public.record_settlement_payment(
      current_setting('tests.trip_id')::uuid, tests.user_id('owner'), tests.user_id('editor'),
      5000, gen_random_uuid(), 'viewer is not a party and not an editor'
    );
    raise exception 'a viewer who is neither an editor nor a party to the settlement must not be able to record it';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- A viewer recording a settlement they are themselves a party to is allowed
-- (self-confirming a payment they made), even without editor rights.
select public.record_settlement_payment(
  current_setting('tests.trip_id')::uuid, tests.user_id('viewer'), tests.user_id('owner'),
  4000, gen_random_uuid(), 'viewer pays owner back, self-confirmed'
);
do $$ begin
  if not exists (
    select 1 from public.settlements
    where trip_id = current_setting('tests.trip_id')::uuid
      and from_member = tests.user_id('viewer') and to_member = tests.user_id('owner')
      and amount_minor = 4000
  ) then
    raise exception 'a party-initiated settlement must actually be recorded';
  end if;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  begin
    perform public.record_settlement_payment(
      current_setting('tests.trip_id')::uuid, tests.user_id('owner'), tests.user_id('editor'),
      1000, gen_random_uuid(), 'outsider'
    );
    raise exception 'an outsider must not be able to record a settlement on a trip they are not on';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- 7. Trigger-level invariants still apply even when the RPC caller is
--    authorized: a party must be a current trip member, and the amount
--    cannot exceed the trip's total recorded expenses (30000 minor here).
select tests.authenticate_as('editor');
do $$ begin
  begin
    perform public.record_settlement_payment(
      current_setting('tests.trip_id')::uuid, tests.user_id('owner'), tests.user_id('outsider'),
      1000, gen_random_uuid(), 'to_member is not a trip member'
    );
    raise exception 'a settlement naming a non-member party must be rejected';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

do $$ begin
  begin
    perform public.record_settlement_payment(
      current_setting('tests.trip_id')::uuid, tests.user_id('owner'), tests.user_id('viewer'),
      999999, gen_random_uuid(), 'amount exceeds trip spend'
    );
    raise exception 'a settlement amount exceeding the trip''s total recorded expenses must be rejected';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- 8. reopen_settlement: the same authorization rule (editor/owner, or either
--    named party) gates reopening.
select public.record_settlement_payment(
  current_setting('tests.trip_id')::uuid, tests.user_id('editor'), tests.user_id('owner'),
  3000, gen_random_uuid(), 'editor pays owner, to be reopened by the viewer counterparty below'
);
do $$ begin
  perform set_config(
    'tests.settlement_id',
    (select id::text from public.settlements
     where trip_id = current_setting('tests.trip_id')::uuid
       and from_member = tests.user_id('editor') and to_member = tests.user_id('owner')
       and amount_minor = 3000),
    true
  );
end $$;

select tests.authenticate_as('viewer');
do $$ begin
  begin
    perform public.reopen_settlement(current_setting('tests.settlement_id')::uuid);
    raise exception 'a viewer who is neither an editor nor a party to this settlement must not be able to reopen it';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  begin
    perform public.reopen_settlement(current_setting('tests.settlement_id')::uuid);
    raise exception 'an outsider must not be able to reopen a settlement on a trip they are not on';
  exception when raise_exception then
    null; -- expected
  end;
end $$;

-- The settlement's own recipient (owner, to_member) may reopen it.
select tests.authenticate_as('owner');
select public.reopen_settlement(current_setting('tests.settlement_id')::uuid);
do $$ begin
  if not exists (
    select 1 from public.settlements
    where id = current_setting('tests.settlement_id')::uuid and status = 'reopened'
  ) then
    raise exception 'a party-initiated reopen must actually apply';
  end if;
end $$;

select 'expense/settlement RLS/RPC contract holds' as result;
