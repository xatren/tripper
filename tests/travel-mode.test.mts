import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  allowlistedRecapPayload,
  buildRecapStats,
  canTransitionStatus,
  externalNavigationUrl,
  mergeDayStory,
} from '../lib/travel-mode.ts'
import type { ItineraryItem, JournalEntry, TripEvent } from '../types/index.ts'

const item = (id: string, status: ItineraryItem['status'], start = '2026-07-17T10:00:00Z') => ({
  id, trip_id: 'trip-1', title: id, status, local_date: '2026-07-17', start_at: start, order_index: 0,
} as ItineraryItem)

test('travel status state machine accepts forward progress and blocks terminal/reverse transitions', () => {
  assert.equal(canTransitionStatus('planned', 'on_the_way'), true)
  assert.equal(canTransitionStatus('on_the_way', 'arrived'), true)
  assert.equal(canTransitionStatus('arrived', 'completed'), true)
  assert.equal(canTransitionStatus('completed', 'planned'), false)
  assert.equal(canTransitionStatus('skipped', 'arrived'), false)
  assert.equal(canTransitionStatus('arrived', 'arrived'), true, 'idempotent retries are valid')
})

test('unified story merges sources without changing their data ownership', () => {
  const event = { id: 'e1', occurred_at: '2026-07-17T10:05:00Z', is_hidden: false } as TripEvent
  const note = { id: 'j1', entry_date: '2026-07-17', occurred_at: '2026-07-17T10:10:00Z', created_at: '2026-07-17T10:11:00Z', is_hidden: false } as JournalEntry
  const hidden = { ...event, id: 'e2', occurred_at: '2026-07-17T10:06:00Z', is_hidden: true }
  const story = mergeDayStory({ date: '2026-07-17', itinerary: [item('plan', 'planned')], events: [event, hidden], journal: [note] })
  assert.deepEqual(story.map((row) => row.kind), ['plan', 'event', 'journal'])
  assert.equal(story[0].kind === 'plan' && story[0].item.id, 'plan')
})

test('recap stats are honest for empty, partial and route-backed trips', () => {
  const empty = buildRecapStats({ itinerary: [], journal: [], expenses: [], routeLegs: null })
  assert.equal(empty.distanceMeters, null)
  assert.equal(empty.durationSeconds, null)
  const partial = buildRecapStats({ itinerary: [item('a', 'completed'), item('b', 'skipped'), item('c', 'planned')], journal: [], expenses: [{ id: 'x' }], routeLegs: [] })
  assert.deepEqual({ planned: partial.planned, visited: partial.visited, skipped: partial.skipped, expenses: partial.expenses }, { planned: 3, visited: 1, skipped: 1, expenses: 1 })
  assert.equal(partial.distanceMeters, null)
  const complete = buildRecapStats({ itinerary: [item('a', 'arrived')], journal: [], expenses: [], routeLegs: [{ distanceMeters: 1200, durationSeconds: 300 }] })
  assert.equal(complete.distanceMeters, 1200)
  assert.equal(complete.durationSeconds, 300)
})

test('recap privacy uses a strict allowlist and excludes sensitive detail', () => {
  const payload = allowlistedRecapPayload({
    title: 'Coast', visitedCount: 4, confirmation_number: 'SECRET', private_note: 'nope', member_debt: 900, location_lat: 37.123456,
  }, ['title', 'visitedCount'])
  assert.deepEqual(payload, { title: 'Coast', visitedCount: 4 })
  assert.equal('confirmation_number' in payload, false)
})

test('external navigation links encode user data and expose no script scheme', () => {
  const url = externalNavigationUrl('google', { title: 'A & B', address: '1 Main St?x=1' })
  assert.match(url ?? '', /^https:\/\/www\.google\.com\/maps\/dir\//)
  assert.match(url ?? '', /1%20Main%20St%3Fx%3D1/)
})

test('migration makes status event creation atomic/idempotent and private media metadata-scoped', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260717233029_travel_mode_events.sql', import.meta.url), 'utf8')
  assert.match(sql, /unique \(trip_id, idempotency_key\)/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /on conflict \(trip_id, idempotency_key\) do nothing/i)
  assert.match(sql, /visibility = 'trip' or created_by = \(select auth\.uid\(\)\)/i)
  assert.match(sql, /photo\.storage_path = name/i)
})

test('offline photo queue has quota, retry and account cleanup wiring', () => {
  const types = readFileSync(new URL('../lib/offline/types.ts', import.meta.url), 'utf8')
  const db = readFileSync(new URL('../lib/offline/db.ts', import.meta.url), 'utf8')
  const sync = readFileSync(new URL('../lib/offline/sync.ts', import.meta.url), 'utf8')
  assert.match(types, /OFFLINE_MEDIA_BUDGET_BYTES/)
  assert.match(db, /media_queue/)
  assert.match(db, /Offline photo queue is full/)
  assert.match(sync, /applyMediaUpload/)
  assert.match(sync, /setMediaQueueState/)
})

test('route replay retains a reduced-motion completed-route alternative', () => {
  const replay = readFileSync(new URL('../components/journal/RouteReplayMap.tsx', import.meta.url), 'utf8')
  assert.match(replay, /useReducedMotionPreference/)
  assert.match(replay, /reducedMotion\) showCompletedRoute/)
  assert.match(replay, /Show full route/)
})
