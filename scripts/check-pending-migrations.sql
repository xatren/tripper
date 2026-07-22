-- Run in Supabase SQL Editor. Shows which recent migrations are already applied.
select
  m.migration,
  case when m.check_kind = 'table' then
    exists (select 1 from information_schema.tables where table_schema='public' and table_name = m.check_name)
  when m.check_kind = 'column' then
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name = split_part(m.check_name, '.', 1) and column_name = split_part(m.check_name, '.', 2)
    )
  when m.check_kind = 'bucket' then
    exists (select 1 from storage.buckets where id = m.check_name)
  end as applied
from (values
  ('20260716233000_reservations.sql',              'table',  'reservations'),
  ('20260716233000_reservations.sql (attachments)', 'table',  'reservation_attachments'),
  ('20260716233000_reservations.sql (bucket)',      'bucket', 'trip-documents'),
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
  ('20260717233029_travel_mode_events.sql (col)',   'column', 'trip_events.visibility')
) as m(migration, check_kind, check_name)
order by 1;
