import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDaySegments,
  checkSegmentFeasibility,
  planDayOptimization,
  type DayItem,
  type DayOptimizationDeps,
} from '../app/trip/[id]/mobile/itinerary/route-optimizer.ts'

let nextCoord = 0

/** Distinct default coordinates per call, so unrelated items never collide as duplicates. */
function item(overrides: Partial<DayItem> & { id: string }): DayItem {
  nextCoord += 1
  return {
    lat: nextCoord,
    lng: nextCoord,
    isLocked: false,
    startAt: null,
    endAt: null,
    durationMinutes: null,
    ...overrides,
  }
}

/** Fake getOptimizedOrder: reverses the movable middle points, keeps anchors fixed. */
function reversingDeps(overrides: Partial<DayOptimizationDeps> = {}): DayOptimizationDeps {
  return {
    getOptimizedOrder: async (points) => {
      const middle = points.slice(1, -1)
      const reversedInputIndices = middle.map((_, i) => middle.length - i) // 1-based input indices, reversed
      const order = [0, ...reversedInputIndices, points.length - 1]
      return { order, distanceMeters: points.length * 1000, durationSeconds: points.length * 300 }
    },
    getFullRoute: async (points) => ({
      legs: points.slice(1).map(() => ({ distanceMeters: 1000, durationSeconds: 300 })),
    }),
    ...overrides,
  }
}

test('buildDaySegments: first, last, locked, and coordinate-less items are anchors', () => {
  const items = [
    item({ id: 'start' }),
    item({ id: 'a' }),
    item({ id: 'locked', isLocked: true }),
    item({ id: 'b' }),
    item({ id: 'no-coords', lat: null, lng: null }),
    item({ id: 'c' }),
    item({ id: 'end' }),
  ]
  const segments = buildDaySegments(items)
  assert.equal(segments.length, 3)
  assert.deepEqual(segments.map((s) => s.movableIndices), [[1], [3], [5]])
  // Each segment here has exactly 1 movable item -> too_few_movable.
  assert.ok(segments.every((s) => s.skip === 'too_few_movable'))
})

test('planDayOptimization: 3-item day gets reordered when beneficial', async () => {
  const items = [item({ id: 'start' }), item({ id: 'mid1' }), item({ id: 'mid2' }), item({ id: 'end' })]
  const outcome = await planDayOptimization(items, reversingDeps())
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(outcome.preview.changed, true)
  assert.deepEqual(outcome.preview.order, ['start', 'mid2', 'mid1', 'end'])
  assert.deepEqual(outcome.preview.movedItemIds.sort(), ['mid1', 'mid2'])
})

test('planDayOptimization: first and last items never move', async () => {
  const items = [item({ id: 'start' }), item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' }), item({ id: 'end' })]
  const outcome = await planDayOptimization(items, reversingDeps())
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(outcome.preview.order[0], 'start')
  assert.equal(outcome.preview.order[outcome.preview.order.length - 1], 'end')
})

test('planDayOptimization: a locked mid-day item never moves and is reported', async () => {
  const items = [
    item({ id: 'start' }),
    item({ id: 'a' }),
    item({ id: 'lockedLunch', isLocked: true }),
    item({ id: 'b' }),
    item({ id: 'c' }),
    item({ id: 'end' }),
  ]
  const outcome = await planDayOptimization(items, reversingDeps())
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(outcome.preview.order[2], 'lockedLunch')
  assert.deepEqual(outcome.preview.lockedItemIds, ['lockedLunch'])
})

test('feasible: required time fits inside the anchors\' real time window', () => {
  const items = [
    item({ id: 'start', endAt: '2026-08-01T09:00:00.000Z' }),
    item({ id: 'a', durationMinutes: 30 }),
    item({ id: 'b', durationMinutes: 30 }),
    item({ id: 'end', startAt: '2026-08-01T11:00:00.000Z' }),
  ]
  const segments = buildDaySegments(items)
  assert.equal(segments.length, 1)
  // 60 min visiting + 20 min driving = 80 min, well inside the 120 min window.
  const result = checkSegmentFeasibility(items, segments[0], 20 * 60)
  assert.equal(result.feasible, true)
})

test('infeasible: required time exceeds the anchors\' real time window', () => {
  const items = [
    item({ id: 'start', endAt: '2026-08-01T09:00:00.000Z' }),
    item({ id: 'a', durationMinutes: 90 }),
    item({ id: 'b', durationMinutes: 90 }),
    item({ id: 'end', startAt: '2026-08-01T10:00:00.000Z' }),
  ]
  const segments = buildDaySegments(items)
  // 180 min visiting + 30 min driving = 210 min, window is only 60 min.
  const result = checkSegmentFeasibility(items, segments[0], 30 * 60)
  assert.equal(result.feasible, false)
  assert.match(result.reason ?? '', /more minute/)
})

test('feasibility check is skipped (treated as feasible) without real timestamps on both sides', () => {
  const items = [item({ id: 'start' }), item({ id: 'a', durationMinutes: 999 }), item({ id: 'end' })]
  const segments = buildDaySegments(items)
  const result = checkSegmentFeasibility(items, segments[0], 999999)
  assert.equal(result.feasible, true)
})

test('planDayOptimization: an infeasible segment keeps its original order and is explained', async () => {
  const items = [
    item({ id: 'start', endAt: '2026-08-01T09:00:00.000Z' }),
    item({ id: 'a', durationMinutes: 90 }),
    item({ id: 'b', durationMinutes: 90 }),
    item({ id: 'end', startAt: '2026-08-01T10:00:00.000Z' }),
  ]
  const outcome = await planDayOptimization(items, reversingDeps())
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.deepEqual(outcome.preview.order, ['start', 'a', 'b', 'end'])
  assert.equal(outcome.preview.changed, false)
  assert.equal(outcome.preview.skippedSegments.length, 1)
  assert.equal(outcome.preview.skippedSegments[0].reason, 'infeasible')
})

test('a segment over the 12-waypoint Mapbox cap is blocked without a network call', async () => {
  const middle = Array.from({ length: 11 }, (_, i) => item({ id: `m${i}` })) // 11 movable + 2 anchors = 13
  const items = [item({ id: 'start' }), ...middle, item({ id: 'end' })]
  let calls = 0
  const deps: DayOptimizationDeps = {
    getOptimizedOrder: async () => { calls += 1; return null },
    getFullRoute: async (points) => ({ legs: points.slice(1).map(() => ({ distanceMeters: 0, durationSeconds: 0 })) }),
  }
  const outcome = await planDayOptimization(items, deps)
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(calls, 0)
  assert.equal(outcome.preview.skippedSegments[0].reason, 'too_many_points')
})

test('a movable item missing coordinates blocks its segment (not the whole day)', async () => {
  const items = [
    item({ id: 'start' }),
    item({ id: 'a' }),
    item({ id: 'no-coords', lat: null, lng: null }),
    item({ id: 'b' }),
    item({ id: 'c' }),
    item({ id: 'end' }),
  ]
  const outcome = await planDayOptimization(items, reversingDeps())
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  // 'no-coords' is itself an anchor (no coords), splitting the day into:
  // [start..no-coords] with 1 movable item ('a') -> too_few_movable, and
  // [no-coords..end] with 2 movable items ('b','c') but a coordinate-less
  // left boundary -> missing_coordinates. Neither segment reorders.
  assert.equal(outcome.preview.changed, false)
  assert.deepEqual(
    outcome.preview.skippedSegments.map((s) => s.reason).sort(),
    ['missing_coordinates', 'too_few_movable'],
  )
})

test('duplicate coordinates within a segment block it', async () => {
  const items = [
    item({ id: 'start', lat: 0, lng: 0 }),
    item({ id: 'a', lat: 1, lng: 1 }),
    item({ id: 'b', lat: 1, lng: 1 }),
    item({ id: 'end', lat: 2, lng: 2 }),
  ]
  const segments = buildDaySegments(items)
  assert.equal(segments[0].skip, 'duplicate_coordinates')
  const outcome = await planDayOptimization(items, reversingDeps())
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(outcome.preview.skippedSegments[0].reason, 'duplicate_coordinates')
})

test('a day with fewer than 3 located items is blocked before any network call', async () => {
  const items = [item({ id: 'a' }), item({ id: 'b', lat: null, lng: null })]
  let calls = 0
  const deps: DayOptimizationDeps = {
    getOptimizedOrder: async () => { calls += 1; return null },
    getFullRoute: async () => { calls += 1; return null },
  }
  const outcome = await planDayOptimization(items, deps)
  assert.equal(outcome.ok, false)
  if (outcome.ok) return
  assert.equal(outcome.reason, 'too_few_items')
  assert.equal(calls, 0)
})

test('an already-optimal day reports changed:false with zero savings', async () => {
  const items = [item({ id: 'start' }), item({ id: 'a' }), item({ id: 'b' }), item({ id: 'end' })]
  const identityDeps: DayOptimizationDeps = {
    getOptimizedOrder: async (points) => ({ order: points.map((_, i) => i), distanceMeters: 100, durationSeconds: 60 }),
    getFullRoute: async (points) => ({ legs: points.slice(1).map(() => ({ distanceMeters: 100, durationSeconds: 60 })) }),
  }
  const outcome = await planDayOptimization(items, identityDeps)
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  assert.equal(outcome.preview.changed, false)
  assert.equal(outcome.preview.savedDistanceMeters, 0)
  assert.equal(outcome.preview.savedDurationSeconds, 0)
})

test('an aborted signal cancels planning', async () => {
  const items = [item({ id: 'start' }), item({ id: 'a' }), item({ id: 'b' }), item({ id: 'end' })]
  const controller = new AbortController()
  controller.abort()
  const outcome = await planDayOptimization(items, { ...reversingDeps(), signal: controller.signal })
  assert.equal(outcome.ok, false)
  if (outcome.ok) return
  assert.equal(outcome.reason, 'cancelled')
})
