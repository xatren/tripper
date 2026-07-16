import assert from 'node:assert/strict'
import test from 'node:test'
import {
  currentTripDay,
  daysBetween,
  localDateISO,
  tripLifecycle,
} from '../app/trip/[id]/mobile/trip-lifecycle.ts'

const TODAY = '2026-07-15'

test('undated when both bounds are missing', () => {
  assert.equal(tripLifecycle({ start_date: null, end_date: null }, TODAY), 'undated')
  assert.equal(tripLifecycle({}, TODAY), 'undated')
})

test('upcoming when the trip starts after today', () => {
  assert.equal(tripLifecycle({ start_date: '2026-07-16', end_date: '2026-07-20' }, TODAY), 'upcoming')
})

test('active from the first through the last day inclusive', () => {
  assert.equal(tripLifecycle({ start_date: '2026-07-15', end_date: '2026-07-20' }, TODAY), 'active')
  assert.equal(tripLifecycle({ start_date: '2026-07-10', end_date: '2026-07-15' }, TODAY), 'active')
  assert.equal(tripLifecycle({ start_date: '2026-07-10', end_date: '2026-07-20' }, TODAY), 'active')
})

test('completed once the end date has passed', () => {
  assert.equal(tripLifecycle({ start_date: '2026-07-01', end_date: '2026-07-14' }, TODAY), 'completed')
})

test('a single known bound acts as a one-day window', () => {
  assert.equal(tripLifecycle({ start_date: '2026-07-16', end_date: null }, TODAY), 'upcoming')
  assert.equal(tripLifecycle({ start_date: '2026-07-15', end_date: null }, TODAY), 'active')
  assert.equal(tripLifecycle({ start_date: null, end_date: '2026-07-14' }, TODAY), 'completed')
})

test('daysBetween counts whole calendar days in both directions', () => {
  assert.equal(daysBetween('2026-07-15', '2026-07-18'), 3)
  assert.equal(daysBetween('2026-07-18', '2026-07-15'), -3)
  assert.equal(daysBetween('2026-07-15', '2026-07-15'), 0)
  // Crosses a typical DST boundary; rounding keeps it a whole day count.
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2)
})

test('currentTripDay is 1-based from the start date', () => {
  assert.equal(currentTripDay('2026-07-15', '2026-07-15'), 1)
  assert.equal(currentTripDay('2026-07-13', '2026-07-15'), 3)
})

test('localDateISO formats a device-local calendar date', () => {
  assert.equal(localDateISO(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.match(localDateISO(), /^\d{4}-\d{2}-\d{2}$/)
})
