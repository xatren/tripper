/*
 * Two kinds of stop, separated only by `nights` (migration
 * 20260808120000_stop_overnight_semantics):
 *   nights >= 1  overnight stop — defines the trip's days
 *   nights  = 0  day stop — passed through, adds no day
 *
 * Regression guard: before this split every stop counted as a night, so a
 * 22-stop route reported a 22-day trip even when the traveler had picked 13.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTimeline,
  projectStopSchedule,
  stopNights,
  type ProjectionItem,
  type ProjectionStop,
} from '../app/trip/[id]/mobile/itinerary-projection.ts'
import { computeStopSchedule } from '../app/trip/[id]/mobile/trip-domain-utils.ts'
import { buildTripIcs } from '../lib/ics.ts'

function stop(id: string, name: string, nights: number): ProjectionStop {
  return { id, name, nights, lat: 47.6, lng: -122.3, address: `${name} address` }
}

// ── stopNights ──────────────────────────────────────────────────────────────

test('stopNights: 0 is a day stop, a missing value keeps the legacy single night', () => {
  assert.equal(stopNights({ nights: 0 }), 0)
  assert.equal(stopNights({ nights: 3 }), 3)
  assert.equal(stopNights({ nights: undefined }), 1)
  assert.equal(stopNights({ nights: null }), 1)
})

test('stopNights floors nonsense negatives at 0 instead of rewinding the trip', () => {
  assert.equal(stopNights({ nights: -2 }), 0)
})

// ── Schedule projection ─────────────────────────────────────────────────────

test('day stops add no day and ride along on the leg they sit on', () => {
  const schedule = projectStopSchedule('2026-06-01', [
    stop('seattle', 'Seattle', 2),
    stop('astoria', 'Astoria', 0),
    stop('cannon', 'Cannon Beach', 0),
    stop('portland', 'Portland', 1),
  ])
  // Seattle occupies Jun 1–2; the two day stops fall on the Jun 3 travel day,
  // which is also Portland's check-in — so all three share day 3.
  assert.deepEqual(schedule.map((s) => s.arrival), ['2026-06-01', '2026-06-03', '2026-06-03', '2026-06-03'])
  assert.deepEqual(schedule.map((s) => s.dayStart), [1, 3, 3, 3])
})

test('a route of day stops only stays on day one', () => {
  const schedule = projectStopSchedule('2026-06-01', [
    stop('a', 'A', 0),
    stop('b', 'B', 0),
    stop('c', 'C', 0),
  ])
  assert.deepEqual(schedule.map((s) => s.arrival), ['2026-06-01', '2026-06-01', '2026-06-01'])
  assert.deepEqual(schedule.map((s) => s.dayStart), [1, 1, 1])
})

// ── Trip length ─────────────────────────────────────────────────────────────

test('a long route of day stops no longer inflates the trip length', () => {
  // The reported bug, in miniature: 3 overnight stops carrying 12 nights, plus
  // 19 day stops — 22 stops total on a 13-day trip.
  const stops: ProjectionStop[] = [
    stop('base1', 'Base 1', 4),
    ...Array.from({ length: 9 }, (_unused, i) => stop(`day${i}`, `Day stop ${i}`, 0)),
    stop('base2', 'Base 2', 4),
    ...Array.from({ length: 10 }, (_unused, i) => stop(`day1${i}`, `Day stop 1${i}`, 0)),
    stop('base3', 'Base 3', 4),
  ]
  assert.equal(stops.length, 22)

  const timeline = buildTimeline({
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-13',
    stops,
    items: [],
  })
  assert.equal(timeline.days.length, 13)
  assert.equal(timeline.overflow.length, 0)
  // Every stop is still on the timeline — day stops are grouped, not dropped.
  const rendered = timeline.days.flatMap((day) => day.entries.map((entry) => entry.key))
  assert.equal(rendered.length, 22)
})

// ── After the Phase 5 backfill ("Make all day stops") ───────────────────────

/** RealTrip1's shape once every night has been cleared in one batch. */
function clearedRoute(): ProjectionStop[] {
  return Array.from({ length: 22 }, (_unused, i) => stop(`s${i}`, `Stop ${i}`, 0))
}

test('clearing every night shortens the plan, not the trip: the dates still own the day count', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-13',
    stops: clearedRoute(),
    items: [],
  })
  assert.equal(timeline.days.length, 13)
  assert.equal(timeline.overflow.length, 0)
  // Every stop rides along on day one until the traveler marks their stays.
  assert.equal(timeline.days[0].entries.length, 22)
  assert.equal(timeline.days[1].entries.length, 0)
  // ...and they are still in route order, not shuffled by key.
  assert.deepEqual(timeline.days[0].entries.slice(0, 3).map((entry) => entry.title), ['Stop 0', 'Stop 1', 'Stop 2'])
})

test('a nightless undated trip is exactly one day — never zero, so nothing is stranded', () => {
  const timeline = buildTimeline({
    tripStartDate: null,
    tripEndDate: null,
    stops: clearedRoute(),
    items: [],
  })
  // An empty day list would drop the Plan tab into its "add a destination"
  // empty state while 22 stops were still sitting in the route.
  assert.equal(timeline.days.length, 1)
  assert.equal(timeline.days[0].date, null)
  assert.equal(timeline.days[0].dayNumber, 1)
  assert.equal(timeline.days[0].entries.length, 22)
  assert.equal(timeline.unscheduled.length, 0)
  assert.equal(timeline.overflow.length, 0)
})

test('an over-planned route lands in overflow instead of stretching the trip', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-03',
    stops: [stop('a', 'A', 2), stop('b', 'B', 2), stop('c', 'C', 2)],
    items: [],
  })
  // Jun 1–3 is three days, whatever the route claims.
  assert.deepEqual(timeline.days.map((day) => day.date), ['2026-06-01', '2026-06-02', '2026-06-03'])
  assert.deepEqual(timeline.days[0].entries.map((e) => e.key), ['stop:a'])
  assert.deepEqual(timeline.days[2].entries.map((e) => e.key), ['stop:b'])
  // C would check in on Jun 5, past the return date.
  assert.deepEqual(timeline.overflow.map((e) => e.key), ['stop:c'])
})

test('without a return date the route still defines how far the timeline reaches', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-06-01',
    tripEndDate: null,
    stops: [stop('a', 'A', 2), stop('b', 'B', 1)],
    items: [],
  })
  assert.deepEqual(timeline.days.map((day) => day.date), ['2026-06-01', '2026-06-02', '2026-06-03'])
  assert.equal(timeline.overflow.length, 0)
})

test('a day stop before any overnight stop shares day one', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-02',
    stops: [stop('viewpoint', 'Viewpoint', 0), stop('base', 'Base', 2)],
    items: [],
  })
  assert.deepEqual(timeline.days[0].entries.map((e) => e.key), ['stop:viewpoint', 'stop:base'])
  assert.equal(timeline.overflow.length, 0)
})

test('items keep widening the range even when the route is capped to it', () => {
  const late: ProjectionItem = {
    id: 'late', stop_id: null, item_type: 'activity', title: 'Late plan', notes: null,
    start_at: null, end_at: null, all_day: true, local_date: '2026-06-04', timezone: null,
    order_index: 0, lat: null, lng: null, address: null, estimated_cost: null,
    currency: null, status: 'planned', is_locked: false, created_at: '2026-05-01T00:00:00Z',
  }
  const timeline = buildTimeline({
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-02',
    stops: [stop('a', 'A', 5)],
    items: [late],
  })
  // An explicitly dated item is the traveler's own choice, so it still shows.
  assert.deepEqual(
    timeline.days.map((day) => day.date),
    ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'],
  )
})

// ── computeStopSchedule (Plan / Bookings / calendar export) ──────────────────

type ScheduleStops = Parameters<typeof computeStopSchedule>[1]

test('computeStopSchedule collapses a day stop onto a single day', () => {
  // Only the fields computeStopSchedule reads; the rest of Stop is irrelevant.
  const stops = [
    { id: 'base', name: 'Base' },
    { id: 'detour', name: 'Detour' },
    { id: 'next', name: 'Next' },
  ] as unknown as ScheduleStops

  const schedule = computeStopSchedule('2026-06-01', stops, { base: 2, detour: 0, next: 1 })

  assert.deepEqual(schedule[0], { arrival: '2026-06-01', departure: '2026-06-03', dayStart: 1, dayEnd: 2 })
  // A day stop never produces a backwards range (dayEnd < dayStart) or a
  // check-out before check-in.
  assert.deepEqual(schedule[1], { arrival: '2026-06-03', departure: '2026-06-03', dayStart: 3, dayEnd: 3 })
  assert.deepEqual(schedule[2], { arrival: '2026-06-03', departure: '2026-06-04', dayStart: 3, dayEnd: 3 })
})

test('computeStopSchedule reads a missing night count as the legacy single night', () => {
  const stops = [{ id: 'a', name: 'A' }] as unknown as ScheduleStops
  const schedule = computeStopSchedule('2026-06-01', stops, {})
  assert.deepEqual(schedule[0], { arrival: '2026-06-01', departure: '2026-06-02', dayStart: 1, dayEnd: 1 })
})

// ── Calendar export ─────────────────────────────────────────────────────────

test('a day stop exports as a single all-day event, not a zero-length one', () => {
  const ics = buildTripIcs('Coast run', [
    { name: 'Cannon Beach', address: null, arrival: '2026-06-03', departure: '2026-06-03' },
  ])
  assert.match(ics, /DTSTART;VALUE=DATE:20260603/)
  // DTEND is exclusive, so it has to clear the start day.
  assert.match(ics, /DTEND;VALUE=DATE:20260604/)
})

test('an overnight stay still uses its own checkout date as DTEND', () => {
  const ics = buildTripIcs('Coast run', [
    { name: 'Seattle', address: null, arrival: '2026-06-01', departure: '2026-06-03' },
  ])
  assert.match(ics, /DTEND;VALUE=DATE:20260603/)
})
