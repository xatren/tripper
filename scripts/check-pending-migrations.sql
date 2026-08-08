-- Run in Supabase SQL Editor. Shows which migrations are already applied.
--
-- Read-only. check_kind meanings:
--   table         -> exists(information_schema.tables)
--   table_absent  -> migration DROPS this table; applied = it's gone
--   column        -> exists(information_schema.columns), 'table.column'
--   column_default-> column exists AND its default matches, 'table.column=default'
--   bucket        -> exists(storage.buckets)
--   function      -> exists(pg_proc) by name in public schema
--   function_source -> function exists AND its body contains a marker string,
--                      'function|marker'. The sharp signal for a migration that
--                      only CREATE OR REPLACEs a function another migration
--                      already created, where a bare 'function' check cannot
--                      tell the two versions apart.
--   function_search_path -> function exists AND has a search_path set in
--                            proconfig (hardening migrations only add config,
--                            they don't rename/create the function)
--
-- Caveat: several early migrations share a table/function with a later
-- migration that only ALTERs it (e.g. 002 and 20260716005552 both touch
-- handle_new_user; 013 and 20260715233000 both touch create_trip_with_stops).
-- A TRUE here proves "at least one of that chain ran", not which one. Where
-- a sharper signal exists (search_path hardening, table drop) it is used
-- instead -- see notes inline.
--
-- 005_activities.sql / 006_activity_order.sql are expected to read FALSE on
-- this project's live DB: the activities/activity_bookmarks feature was
-- scaffolded in migrations but never applied, and the app has no code path
-- that reads/writes those tables (verified 2026-07-28). 012 and
-- 20260716005552 both guard their `public.activities` references with
-- `to_regclass(...) is not null`, so they no-op cleanly without it -- this
-- is dead schema-in-waiting, not a blocking gap.
select
  m.migration,
  case when m.check_kind = 'table' then
    exists (select 1 from information_schema.tables where table_schema='public' and table_name = m.check_name)
  when m.check_kind = 'table_absent' then
    not exists (select 1 from information_schema.tables where table_schema='public' and table_name = m.check_name)
  when m.check_kind = 'column' then
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name = split_part(m.check_name, '.', 1) and column_name = split_part(m.check_name, '.', 2)
    )
  when m.check_kind = 'column_default' then
    exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name = split_part(split_part(m.check_name, '=', 1), '.', 1)
        and column_name = split_part(split_part(m.check_name, '=', 1), '.', 2)
        and column_default = split_part(m.check_name, '=', 2)
    )
  when m.check_kind = 'bucket' then
    exists (select 1 from storage.buckets where id = m.check_name)
  when m.check_kind = 'function' then
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = m.check_name
    )
  when m.check_kind = 'function_source' then
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = split_part(m.check_name, '|', 1)
        and p.prosrc like '%' || split_part(m.check_name, '|', 2) || '%'
    )
  when m.check_kind = 'function_search_path' then
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = m.check_name
        and p.proconfig is not null
        and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
    )
  end as applied
from (values
  ('000_full_schema.sql',                                    'table',    'photos'),
  ('001_initial_schema.sql',                                 'table',    'trip_members'),
  ('002_fix_profile_trigger.sql',                             'function','handle_new_user'),
  ('003_add_stops_expenses_photos.sql',                       'table',   'photos'),
  ('004_stops_place_fields.sql',                               'column', 'stops.is_favorite'),
  ('005_activities.sql',                                       'table',  'activity_bookmarks'),
  ('006_activity_order.sql',                                   'column', 'activities.time_of_day'),
  ('007_trips_focus_location.sql',                             'column', 'trips.focus_lng'),
  ('008_trip_persistence.sql',                                 'column', 'stops.nights'),
  ('009_trip_countries.sql',                                   'column', 'trips.countries'),
  ('010_packing_items.sql',                                    'table',  'packing_items'),
  ('011_journal.sql',                                          'table',  'journal_photos'),
  ('012_trip_members_authorization.sql',                       'function','join_trip_by_invite'),
  ('013_create_trip_with_stops.sql',                           'function','create_trip_with_stops'),
  ('014_reorder_trip_stops.sql',                               'function','reorder_trip_stops'),
  ('015_drop_legacy_pins_budget.sql',                          'table_absent', 'pins'),
  ('016_trip_domain_realtime.sql',                             'table',  'trip_realtime_deletes'),
  ('20260715231929_journal_photo_privacy.sql (bucket exists)', 'bucket', 'trip-photos'),
  ('20260715233000_validate_create_trip_with_stops.sql',       'function','create_trip_with_stops'),
  ('20260716005552_active_schema_grants_and_account_deletion.sql (search_path)', 'function_search_path', 'handle_new_user'),
  ('20260716120000_itinerary_items.sql',                       'table',  'itinerary_items'),
  ('20260716215756_add_itinerary_visit_duration.sql',          'column', 'itinerary_items.duration_minutes'),
  ('20260716220137_add_itinerary_place_identity.sql',          'column', 'itinerary_items.normalized_address'),
  ('20260716233000_reservations.sql',              'table',  'reservations'),
  ('20260716233000_reservations.sql (attachments)', 'table',  'reservation_attachments'),
  ('20260716233000_reservations.sql (bucket)',      'bucket', 'trip-documents'),
  ('20260716234500_optimize_itinerary_day_apply.sql',          'function','optimize_itinerary_day_apply'),
  ('20260717010000_expense_splits.sql',             'table',  'expense_splits'),
  ('20260717010000_expense_splits.sql (col)',       'column', 'expenses.split_type'),
  ('20260717020000_settlements.sql',                'table',  'settlements'),
  ('20260717030000_expense_receipts.sql',           'table',  'expense_receipts'),
  ('20260717040000_trip_readiness.sql',             'table',  'trip_tasks'),
  ('20260717040000_trip_readiness.sql (col)',       'column', 'packing_items.assigned_to'),
  ('20260717230803_trip_collaboration.sql',         'table',  'trip_comments'),
  ('20260717230803_trip_collaboration.sql (mentions)','table','trip_comment_mentions'),
  ('20260717230803_trip_collaboration.sql (activity)','table','trip_activity'),
  ('20260717233029_travel_mode_events.sql',         'table',  'trip_events'),
  ('20260717233029_travel_mode_events.sql (col)',   'column', 'trip_events.visibility'),
  ('20260728000000_settlement_finance_invariants.sql',        'function', 'validate_settlement_invariants'),
  ('20260728010000_invite_rate_limiting.sql',                  'table',   'invite_join_attempts'),
  ('20260728020000_shared_rate_limiting.sql',                  'table',   'rate_limit_events'),
  ('20260728020000_shared_rate_limiting.sql (config)',         'table',   'rate_limit_scope_config'),
  ('20260728020000_shared_rate_limiting.sql (fn)',             'function','check_rate_limit'),
  -- Two halves, two checks. The ALTER makes a stop added from Plan a day stop;
  -- the CREATE OR REPLACE keeps the creation RPC at one night per stop. If the
  -- first reads TRUE and the second FALSE, every trip made from the wizard or an
  -- Explore route template is being born with zero-night stops.
  ('20260808120000_stop_overnight_semantics.sql (nights default)', 'column_default',  'stops.nights=0'),
  ('20260808120000_stop_overnight_semantics.sql (RPC nights)',     'function_source', 'create_trip_with_stops|nights')
) as m(migration, check_kind, check_name)
order by 1;
