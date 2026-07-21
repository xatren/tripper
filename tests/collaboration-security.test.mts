import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { tripCapabilitiesForRole } from '../lib/trip-capabilities.ts'
import { isPresenceFresh } from '../lib/presence.ts'

const migration = readFileSync(new URL('../supabase/migrations/20260717230803_trip_collaboration.sql', import.meta.url), 'utf8')
const realtime = readFileSync(new URL('../lib/supabase/trip-realtime.tsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../app/trip/[id]/mobile/TripMobileClient.tsx', import.meta.url), 'utf8')

test('owner/editor/viewer capability matrix stays least-privilege', () => {
  assert.deepEqual(tripCapabilitiesForRole('owner'), { role: 'owner', canEdit: true, canManageTrip: true })
  assert.deepEqual(tripCapabilitiesForRole('editor'), { role: 'editor', canEdit: true, canManageTrip: false })
  assert.deepEqual(tripCapabilitiesForRole('viewer'), { role: 'viewer', canEdit: false, canManageTrip: false })
})

test('member RPC locks the trip and protects the last owner', () => {
  assert.match(migration, /from public\.trips where id = p_trip_id for update/i)
  assert.match(migration, /owner_count <= 1[\s\S]*must keep at least one owner/i)
  assert.match(migration, /last owner cannot leave or be removed/i)
  assert.match(migration, /revoke insert, update, delete on public\.trip_members from authenticated/i)
})

test('comment entity validation denies cross-trip injection and stores structured mentions', () => {
  assert.match(migration, /entity_trip_id <> new\.trip_id/i)
  assert.match(migration, /Comment entity does not belong to this trip/i)
  assert.match(migration, /create table public\.trip_comment_mentions/i)
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/i)
})

test('invite rotation is owner-only, serialized, and replaces the prior code', () => {
  assert.match(migration, /create or replace function public\.rotate_trip_invite/i)
  assert.match(migration, /Only a trip owner can rotate the invite/i)
  assert.match(migration, /update public\.trips set invite_code = next_code/i)
})

test('presence freshness rejects stale and malformed heartbeats', () => {
  const now = Date.parse('2026-07-17T12:00:00.000Z')
  assert.equal(isPresenceFresh('2026-07-17T11:59:30.000Z', now), true)
  assert.equal(isPresenceFresh('2026-07-17T11:59:00.000Z', now), false)
  assert.equal(isPresenceFresh('not-a-date', now), false)
})

test('private Presence is membership-authorized and listeners clean up on reconnect/unmount', () => {
  assert.match(migration, /realtime\.topic\(\) = 'trip:' \|\| tm\.trip_id::text/i)
  assert.match(migration, /tm\.user_id = \(select auth\.uid\(\)\)/i)
  assert.match(realtime, /config: \{ private: true, presence:/)
  assert.match(realtime, /void channel\.untrack\(\)/)
  assert.match(realtime, /void supabase\.removeChannel\(channel\)/)
  assert.equal((realtime.match(/channel\.subscribe\(/g) ?? []).length, 1)
})

test('permission revocation clears member state and routes away', () => {
  assert.match(client, /setMembers\(\[\]\)/)
  assert.match(client, /permission_revoked/)
  assert.match(client, /setCapabilities\(tripCapabilitiesForRole\('viewer'\)\)/)
  assert.match(client, /setInterval\(\(\) => void refreshMembership\(\), 30_000\)/)
})
