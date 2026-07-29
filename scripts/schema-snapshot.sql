-- ============================================================================
-- RM-003: Live schema truth snapshot (read-only).
--
-- Run this whole file in the Supabase SQL Editor against the LIVE project.
-- It performs no writes/DDL -- every statement is a SELECT against catalog
-- views (information_schema / pg_catalog / storage.buckets / pg_policies).
--
-- How to use:
--   1. Run in SQL Editor, export each result set (or screenshot) with a
--      timestamp and the project ref in the filename, e.g.
--      2026-07-28_<project-ref>_01-extensions.csv
--   2. Diff the "tables" and "columns" sections against
--      supabase/migrations/*.sql and scripts/check-pending-migrations.sql
--      to produce the applied/unknown report RM-003 asks for.
--   3. PITR/backup status is NOT queryable via SQL -- check the Supabase
--      dashboard under Settings -> Database -> Backups and record the
--      retention window / RPO-RTO separately.
-- ============================================================================

-- 1. Extensions -----------------------------------------------------------
select extname, extversion, extnamespace::regnamespace as schema
from pg_extension
order by extname;

-- 2. Non-system schemas -----------------------------------------------------
select nspname as schema
from pg_namespace
where nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and nspname not like 'pg_temp%'
  and nspname not like 'pg_toast_temp%'
order by nspname;

-- 3. Tables in public schema (with RLS status) ------------------------------
select
  c.relname as table_name,
  c.relkind as kind, -- r = table, v = view, m = materialized view
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_catalog.obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'v', 'm')
order by c.relname;

-- 4. Columns for every public table -----------------------------------------
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 5. Constraints (PK / FK / UNIQUE / CHECK) ---------------------------------
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name as references_table,
  ccu.column_name as references_column
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
order by tc.table_name, tc.constraint_type, tc.constraint_name;

-- 6. Indexes ------------------------------------------------------------
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 7. RLS policies (public + storage) -----------------------------------
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 8. Table/column grants to non-superuser roles ------------------------
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by table_schema, table_name, grantee, privilege_type;

-- 9. Routine (function) grants -------------------------------------------
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by routine_name, grantee;

-- 10. Functions/RPCs in public schema, with security + search_path ------
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security,
  p.proconfig as config, -- look for search_path=... here
  l.lanname as language,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
order by p.proname;

-- 11. Triggers -------------------------------------------------------------
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 12. Storage buckets --------------------------------------------------
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
from storage.buckets
order by id;

-- 13. Realtime publication membership -------------------------------------
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 14. Roles present (sanity check for anon/authenticated/service_role) -----
select rolname, rolsuper, rolcanlogin
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
order by rolname;
