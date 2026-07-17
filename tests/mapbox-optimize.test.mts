import assert from 'node:assert/strict'
import test from 'node:test'
import { getOptimizedOrder } from '../lib/mapbox/optimize.ts'

const threePoints = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }]

function okResponse(order: number[], distance = 1000, duration = 600) {
  // byInput[inputIndex] = { waypoint_index: optimizedPosition }
  const byInput: { waypoint_index: number }[] = []
  order.forEach((inputIndex, optimizedPosition) => { byInput[inputIndex] = { waypoint_index: optimizedPosition } })
  return new Response(JSON.stringify({
    code: 'Ok',
    waypoints: byInput,
    trips: [{ distance, duration }],
  }), { status: 200 })
}

test('rejects fewer than 3 or more than 12 points without any network call', async () => {
  let calls = 0
  const fetcher = async () => { calls += 1; throw new Error('should not fetch') }
  assert.equal(await getOptimizedOrder([threePoints[0], threePoints[1]], { accessToken: 't', fetcher }), null)
  const thirteen = Array.from({ length: 13 }, (_, i) => ({ lat: i, lng: i }))
  assert.equal(await getOptimizedOrder(thirteen, { accessToken: 't', fetcher }), null)
  assert.equal(calls, 0)
})

test('returns null without a token, even with a valid point count', async () => {
  let calls = 0
  const result = await getOptimizedOrder(threePoints, { accessToken: '', fetcher: async () => { calls += 1; return okResponse([0, 1, 2]) } })
  assert.equal(result, null)
  assert.equal(calls, 0)
})

test('parses a successful optimized-trip response into an input-index order', async () => {
  const result = await getOptimizedOrder(threePoints, {
    accessToken: 'test-token',
    fetcher: async () => okResponse([0, 2, 1], 5000, 900),
  })
  assert.deepEqual(result, { order: [0, 2, 1], distanceMeters: 5000, durationSeconds: 900 })
})

test('treats a non-Ok Mapbox response code as no result', async () => {
  const result = await getOptimizedOrder(threePoints, {
    accessToken: 'test-token',
    fetcher: async () => new Response(JSON.stringify({ code: 'NoRoute', waypoints: [] }), { status: 200 }),
  })
  assert.equal(result, null)
})

test('treats a non-ok HTTP response as no result', async () => {
  const result = await getOptimizedOrder(threePoints, {
    accessToken: 'test-token',
    fetcher: async () => new Response('', { status: 500 }),
  })
  assert.equal(result, null)
})

test('an already-aborted request performs no fetch', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const result = await getOptimizedOrder(threePoints, {
    accessToken: 'test-token',
    signal: controller.signal,
    fetcher: async () => { calls += 1; throw new Error('should not fetch') },
  })
  assert.equal(result, null)
  assert.equal(calls, 0)
})
