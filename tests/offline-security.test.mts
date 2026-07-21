import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  OFFLINE_SNAPSHOT_SCHEMA_VERSION,
  offlineSnapshotKey,
  migrateSnapshot,
  sanitizeOfflinePayload,
  snapshotChecksum,
  validateSnapshot,
  type TripOfflineSnapshot,
} from '../lib/offline/types.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function snapshot(userId = 'user-a', tripId = 'trip-1'): TripOfflineSnapshot {
  const unsigned = {
    schema_version: OFFLINE_SNAPSHOT_SCHEMA_VERSION,
    key: offlineSnapshotKey(userId, tripId), user_id: userId, trip_id: tripId,
    downloaded_at: '2026-07-17T00:00:00.000Z', updated_at: '2026-07-17T00:00:00.000Z',
    trip: { id: tripId, title: 'Safe trip' }, members: [], stops: [], itinerary: [], reservations: [],
    packing: [], tasks: [], expenses: [], journal: [], route_geometry: [], media_manifest: [],
  }
  return { ...unsigned, checksum: snapshotChecksum(unsigned), size_bytes: 100 }
}

test('snapshot namespace and validation never expose user A data to user B', () => {
  const value = snapshot()
  assert.equal(validateSnapshot(value, 'user-a', 'trip-1'), true)
  assert.equal(validateSnapshot(value, 'user-b', 'trip-1'), false)
  assert.equal(offlineSnapshotKey('user-a', 'trip-1'), 'user-a:trip-1')
})

test('schema mismatch and corrupt snapshot are rejected for safe redownload', () => {
  assert.equal(validateSnapshot({ ...snapshot(), schema_version: 999 }, 'user-a', 'trip-1'), false)
  assert.equal(validateSnapshot({ ...snapshot(), trip: { title: 'tampered' } }, 'user-a', 'trip-1'), false)
  assert.equal(migrateSnapshot({ ...snapshot(), schema_version: 999 }, 'user-a', 'trip-1'), null)
})

test('mutation payload allowlist strips sensitive or uncontrolled fields', () => {
  assert.deepEqual(sanitizeOfflinePayload('journal_entry', 'create', {
    id: 'j1', trip_id: 't1', entry_date: '2026-07-17', note: 'hello', created_by: 'u1', storage_path: 'secret', arbitrary: true,
  }), { id: 'j1', trip_id: 't1', entry_date: '2026-07-17', note: 'hello', created_by: 'u1' })
  assert.throws(() => sanitizeOfflinePayload('expense', 'update_note', {}))
})

test('service worker keeps authenticated navigations network-only and caches only a public shell', () => {
  const sw = read('public/sw.js')
  assert.match(sw, /req\.mode === 'navigate'/)
  assert.match(sw, /fetch\(req\)\.catch\(\(\) => caches\.open\(STATIC_CACHE\)/)
  assert.doesNotMatch(sw, /cache\.put\(req[\s\S]*?req\.mode === 'navigate'/)
  assert.match(sw, /tripper-static-v3/)
  assert.match(sw, /TRIPPER_SYNC_REQUESTED/)
})

test('logout, account deletion, auth user change and retry policy are wired', () => {
  const profile = read('app/profile/ProfileClient.tsx')
  const register = read('components/pwa/RegisterSW.tsx')
  const sync = read('lib/offline/sync.ts')
  assert.match(profile, /clearPrivateOfflineData\(\)/)
  assert.match(register, /SIGNED_OUT[\s\S]*?clearTripperDeviceData/)
  assert.match(register, /bindActiveOfflineUser/)
  assert.match(sync, /status === 401 \|\| status === 403/)
  assert.match(sync, /OFFLINE_MAX_RETRIES/)
  assert.match(sync, /kind: 'conflict'/)
})
