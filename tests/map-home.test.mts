import assert from 'node:assert/strict'
import test from 'node:test'
import { selectFeaturedTrip } from '../lib/map-home.ts'

const TODAY = '2026-08-05'
const trip = (id: string, start_date: string | null, end_date: string | null, updated_at = '2026-07-01T00:00:00Z') => ({ id, start_date, end_date, updated_at })

test('selects the active trip with the nearest start date', () => {
  assert.equal(selectFeaturedTrip([
    trip('older-active', '2026-07-01', '2026-08-10'),
    trip('nearest-active', '2026-08-03', '2026-08-09'),
  ], TODAY)?.id, 'nearest-active')
})

test('selects the nearest upcoming trip when none are active', () => {
  assert.equal(selectFeaturedTrip([
    trip('later', '2026-10-01', '2026-10-05'),
    trip('next', '2026-08-09', '2026-08-12'),
  ], TODAY)?.id, 'next')
})

test('falls back to the most recently updated undated trip', () => {
  assert.equal(selectFeaturedTrip([
    trip('old', null, null, '2026-07-01T00:00:00Z'),
    trip('new', null, null, '2026-08-01T00:00:00Z'),
  ], TODAY)?.id, 'new')
})

test('falls back to the most recently completed trip', () => {
  assert.equal(selectFeaturedTrip([
    trip('old', '2026-05-01', '2026-05-10'),
    trip('recent', '2026-07-25', '2026-08-01'),
  ], TODAY)?.id, 'recent')
})

test('breaks equal-date ties with updated_at and then id', () => {
  assert.equal(selectFeaturedTrip([
    trip('b', '2026-08-05', '2026-08-07', '2026-08-01T00:00:00Z'),
    trip('a', '2026-08-05', '2026-08-07', '2026-08-02T00:00:00Z'),
  ], TODAY)?.id, 'a')
  assert.equal(selectFeaturedTrip([
    trip('b', '2026-08-05', '2026-08-07'),
    trip('a', '2026-08-05', '2026-08-07'),
  ], TODAY)?.id, 'a')
})

test('returns null for an empty trip list', () => {
  assert.equal(selectFeaturedTrip([], TODAY), null)
})
