import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const profile = readFileSync('app/profile/ProfileClient.tsx', 'utf8')
const deletionRoute = readFileSync('app/api/account/delete/route.ts', 'utf8')
const serviceClient = readFileSync('lib/supabase/admin.ts', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260716005552_active_schema_grants_and_account_deletion.sql',
  'utf8',
)

test('account deletion uses an authenticated server boundary and never exposes the service key', () => {
  assert.match(profile, /fetch\('\/api\/account\/delete'/)
  assert.match(deletionRoute, /supabase\.auth\.getUser\(\)/)
  assert.match(deletionRoute, /admin\.auth\.admin\.signOut\(accessToken, 'global'\)/)
  assert.match(deletionRoute, /admin\.auth\.admin\.deleteUser\(user\.id\)/)
  assert.match(serviceClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(profile, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('account deletion removes private storage objects and clears local caches', () => {
  assert.match(deletionRoute, /admin\.storage\.from\(JOURNAL_BUCKET\)\.remove/)
  assert.match(deletionRoute, /\.from\('journal_photos'\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\('uploaded_by', user\.id\)/)
  assert.match(profile, /clearTripperCaches\(\)/)
  assert.match(profile, /signOut\(\{ scope: 'local' \}\)/)
})

test('active Data API grants are explicit and attribution foreign keys permit deletion', () => {
  for (const table of [
    'profiles',
    'trips',
    'trip_members',
    'stops',
    'packing_items',
    'expenses',
    'journal_entries',
    'journal_photos',
    'trip_realtime_deletes',
  ]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon`))
  }
  assert.match(migration, /references public\.profiles\(id\) on delete set null/)
  assert.match(migration, /alter function public\.handle_new_user\(\) set search_path = public/)
  assert.match(migration, /with check \(auth\.uid\(\) = id\)/)
})
