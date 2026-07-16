import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTimelineMapPoints,
  cleanSelectedItemId,
  getMapAvailability,
  isUserCameraEvent,
} from '../app/trip/[id]/mobile/trip-map-model.ts'
import {
  getFullRoute,
  LatestRouteRequestController,
  MAPBOX_DIRECTIONS_MAX_COORDINATES,
} from '../lib/mapbox/directions.ts'

const days = [
  { date: '2026-08-01', dayNumber: 1, entries: [
    { key: 'item:a', id: 'a', source: 'item' as const, itemType: 'activity', title: 'A', address: null, lat: 1, lng: 2 },
  ] },
  { date: '2026-08-02', dayNumber: 2, entries: [
    { key: 'item:b', id: 'b', source: 'item' as const, itemType: 'restaurant', title: 'B', address: null, lat: 3, lng: 4 },
    { key: 'item:no-coords', id: 'no-coords', source: 'item' as const, itemType: 'note', title: 'N', address: null, lat: null, lng: null },
  ] },
]

test('day filter strongly shows the selected day and can hide or dim other days', () => {
  assert.deepEqual(buildTimelineMapPoints(days, '2026-08-02', 'hidden').map((point) => point.id), ['item:b'])
  const dimmed = buildTimelineMapPoints(days, '2026-08-02', 'dimmed')
  assert.deepEqual(dimmed.map((point) => [point.id, point.emphasis]), [['item:a', 'dimmed'], ['item:b', 'strong']])
})

test('selection survives view changes and is cleaned when its item is deleted', () => {
  assert.equal(cleanSelectedItemId('item:a', ['item:a', 'item:b']), 'item:a')
  assert.equal(cleanSelectedItemId('item:a', ['item:b']), null)
})

test('programmatic camera movement is distinct from a user gesture', () => {
  assert.equal(isUserCameraEvent({}), false)
  assert.equal(isUserCameraEvent({ originalEvent: { type: 'touchmove' } }), true)
})

test('no-token, offline, and Mapbox error states are explicit', () => {
  assert.equal(getMapAvailability({ hasToken: false, online: true, failed: false }), 'no-token')
  assert.equal(getMapAvailability({ hasToken: true, online: false, failed: false }), 'offline')
  assert.equal(getMapAvailability({ hasToken: true, online: true, failed: true }), 'error')
})

test('starting a new route request aborts and invalidates the stale request', () => {
  const requests = new LatestRouteRequestController()
  const stale = requests.begin()
  const current = requests.begin()
  assert.equal(stale.signal.aborted, true)
  assert.equal(requests.isCurrent(stale), false)
  assert.equal(requests.isCurrent(current), true)
})

test('an already-aborted Directions request performs no API call', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const result = await getFullRoute([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], {
    signal: controller.signal,
    accessToken: 'public-test-token',
    fetcher: async () => {
      calls += 1
      throw new Error('should not fetch')
    },
  })
  assert.equal(result, null)
  assert.equal(calls, 0)
})

test('routes above the waypoint limit are split into overlapping requests', async () => {
  const points = Array.from({ length: MAPBOX_DIRECTIONS_MAX_COORDINATES + 2 }, (_, index) => ({ lat: index, lng: index }))
  let calls = 0
  const result = await getFullRoute(points, {
    accessToken: 'public-test-token',
    fetcher: async () => {
      calls += 1
      return new Response(JSON.stringify({ routes: [{ duration: 60, distance: 1000, geometry: { coordinates: [[0, 0], [1, 1]] }, legs: [{ duration: 60, distance: 1000 }] }] }), { status: 200 })
    },
  })
  assert.equal(calls, 2)
  assert.equal(result?.requestCount, 2)
})
