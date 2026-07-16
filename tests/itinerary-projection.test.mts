import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDaysISO,
  buildTimeline,
  effectiveLocalDate,
  localDateFromInstant,
  markConflicts,
  projectStopSchedule,
  type ProjectionItem,
  type ProjectionStop,
  type TimelineEntry,
} from '../app/trip/[id]/mobile/itinerary-projection.ts'

function stop(id: string, name: string, nights = 1): ProjectionStop {
  return { id, name, nights, lat: 41.9, lng: 12.5, address: `${name} address` }
}

function item(overrides: Partial<ProjectionItem> & { id: string }): ProjectionItem {
  return {
    stop_id: null,
    item_type: 'activity',
    title: `Item ${overrides.id}`,
    notes: null,
    start_at: null,
    end_at: null,
    all_day: false,
    local_date: null,
    timezone: null,
    order_index: 0,
    lat: null,
    lng: null,
    address: null,
    estimated_cost: null,
    currency: null,
    status: 'planned',
    is_locked: false,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

// ── Stop schedule projection ────────────────────────────────────────────────

test('stop schedule walks the trip start date through nights', () => {
  const schedule = projectStopSchedule('2026-08-01', [stop('a', 'Rome', 2), stop('b', 'Florence', 1), stop('c', 'Milan', 3)])
  assert.deepEqual(schedule.map((s) => s.arrival), ['2026-08-01', '2026-08-03', '2026-08-04'])
  assert.deepEqual(schedule.map((s) => s.dayStart), [1, 3, 4])
})

test('undated trips still produce day numbers', () => {
  const schedule = projectStopSchedule(null, [stop('a', 'Rome', 2), stop('b', 'Florence')])
  assert.deepEqual(schedule.map((s) => s.arrival), [null, null])
  assert.deepEqual(schedule.map((s) => s.dayStart), [1, 3])
})

test('legacy trip with no items projects every stop onto its arrival day', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-08-01',
    tripEndDate: '2026-08-04',
    stops: [stop('a', 'Rome', 2), stop('b', 'Florence', 2)],
    items: [],
  })
  assert.equal(timeline.days.length, 4)
  assert.deepEqual(timeline.days.map((d) => d.date), ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
  assert.deepEqual(timeline.days[0].entries.map((e) => e.key), ['stop:a'])
  assert.deepEqual(timeline.days[2].entries.map((e) => e.key), ['stop:b'])
  assert.equal(timeline.days[0].entries[0].editable, false)
  assert.equal(timeline.unscheduled.length, 0)
})

test('a stop with a linked item is represented by the item, not the projection', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-08-01',
    tripEndDate: '2026-08-02',
    stops: [stop('a', 'Rome', 2)],
    items: [item({ id: 'i1', stop_id: 'a', item_type: 'stay', local_date: '2026-08-01' })],
  })
  const keys = timeline.days.flatMap((d) => d.entries.map((e) => e.key))
  assert.ok(keys.includes('item:i1'))
  assert.ok(!keys.includes('stop:a'))
})

// ── Day grouping and ordering ───────────────────────────────────────────────

test('within a day: stop arrival leads, then order_index, then start time; order is stable', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-08-01',
    tripEndDate: '2026-08-01',
    stops: [stop('a', 'Rome')],
    items: [
      item({ id: 'later', local_date: '2026-08-01', order_index: 1, start_at: '2026-08-01T15:00:00Z' }),
      item({ id: 'timed2', local_date: '2026-08-01', order_index: 0, start_at: '2026-08-01T12:00:00Z' }),
      item({ id: 'timed1', local_date: '2026-08-01', order_index: 0, start_at: '2026-08-01T09:00:00Z' }),
      item({ id: 'tie-b', local_date: '2026-08-01', order_index: 2, created_at: '2026-07-02T00:00:00Z' }),
      item({ id: 'tie-a', local_date: '2026-08-01', order_index: 2, created_at: '2026-07-01T00:00:00Z' }),
    ],
  })
  assert.deepEqual(
    timeline.days[0].entries.map((e) => e.key),
    ['stop:a', 'item:timed1', 'item:timed2', 'item:later', 'item:tie-a', 'item:tie-b'],
  )
})

test('item dates outside the trip range widen the visible days instead of hiding', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-08-02',
    tripEndDate: '2026-08-03',
    stops: [],
    items: [item({ id: 'early', local_date: '2026-08-01' }), item({ id: 'late', local_date: '2026-08-05' })],
  })
  assert.deepEqual(
    timeline.days.map((d) => d.date),
    ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'],
  )
  // Day numbers stay anchored to the trip start.
  assert.deepEqual(timeline.days.map((d) => d.dayNumber), [0, 1, 2, 3, 4])
})

test('items without any date land in the unscheduled bucket', () => {
  const timeline = buildTimeline({
    tripStartDate: '2026-08-01',
    tripEndDate: '2026-08-01',
    stops: [],
    items: [item({ id: 'someday' })],
  })
  assert.deepEqual(timeline.unscheduled.map((e) => e.key), ['item:someday'])
  assert.equal(timeline.days[0].entries.length, 0)
})

test('undated trip: stops group under numbered days, dated items add dated days', () => {
  const timeline = buildTimeline({
    tripStartDate: null,
    tripEndDate: null,
    stops: [stop('a', 'Rome', 2), stop('b', 'Florence')],
    items: [item({ id: 'i1', local_date: '2026-09-10' })],
  })
  const dated = timeline.days.filter((d) => d.date !== null)
  const numbered = timeline.days.filter((d) => d.date === null)
  assert.deepEqual(dated.map((d) => d.date), ['2026-09-10'])
  assert.deepEqual(numbered.map((d) => d.dayNumber), [1, 3])
})

// ── Timezone / local date ───────────────────────────────────────────────────

test('localDateFromInstant renders the wall-clock day of the given zone', () => {
  // 23:30 UTC is already the next day in Tokyo, still the same day in New York.
  assert.equal(localDateFromInstant('2026-08-01T23:30:00Z', 'Asia/Tokyo'), '2026-08-02')
  assert.equal(localDateFromInstant('2026-08-01T23:30:00Z', 'America/New_York'), '2026-08-01')
})

test('effectiveLocalDate prefers explicit local_date over start_at derivation', () => {
  assert.equal(
    effectiveLocalDate({ local_date: '2026-08-05', start_at: '2026-08-01T10:00:00Z', timezone: 'UTC' }),
    '2026-08-05',
  )
  assert.equal(
    effectiveLocalDate({ local_date: null, start_at: '2026-08-01T23:30:00Z', timezone: 'Asia/Tokyo' }),
    '2026-08-02',
  )
  assert.equal(effectiveLocalDate({ local_date: null, start_at: null, timezone: null }), null)
})

test('an invalid timezone falls back instead of throwing', () => {
  assert.match(localDateFromInstant('2026-08-01T12:00:00Z', 'Not/A_Zone'), /^\d{4}-\d{2}-\d{2}$/)
})

test('addDaysISO crosses month boundaries', () => {
  assert.equal(addDaysISO('2026-08-31', 1), '2026-09-01')
})

// ── Conflicts ───────────────────────────────────────────────────────────────

function timedEntry(id: string, startAt: string, endAt: string | null, status = 'planned'): TimelineEntry {
  return {
    key: `item:${id}`, source: 'item', id, itemType: 'activity', title: id,
    address: null, lat: null, lng: null, startAt, endAt, allDay: false,
    status, isLocked: false, orderIndex: 0, stopId: null, notes: null,
    estimatedCost: null, currency: null, conflict: false, editable: true,
  }
}

test('overlapping timed entries are flagged, touching boundaries are not', () => {
  const overlapA = timedEntry('a', '2026-08-01T10:00:00Z', '2026-08-01T12:00:00Z')
  const overlapB = timedEntry('b', '2026-08-01T11:00:00Z', '2026-08-01T13:00:00Z')
  const touching = timedEntry('c', '2026-08-01T13:00:00Z', '2026-08-01T14:00:00Z')
  markConflicts([overlapA, overlapB, touching])
  assert.equal(overlapA.conflict, true)
  assert.equal(overlapB.conflict, true)
  assert.equal(touching.conflict, false)
})

test('identical start instants conflict even without an end', () => {
  const a = timedEntry('a', '2026-08-01T10:00:00Z', null)
  const b = timedEntry('b', '2026-08-01T10:00:00Z', null)
  markConflicts([a, b])
  assert.equal(a.conflict && b.conflict, true)
})

test('skipped entries never participate in conflicts', () => {
  const a = timedEntry('a', '2026-08-01T10:00:00Z', '2026-08-01T12:00:00Z')
  const b = timedEntry('b', '2026-08-01T10:30:00Z', '2026-08-01T11:00:00Z', 'skipped')
  markConflicts([a, b])
  assert.equal(a.conflict, false)
  assert.equal(b.conflict, false)
})
