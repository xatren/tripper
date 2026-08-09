import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  heroCopy,
  orderStops,
  photosActionLabel,
  preparationProgress,
  routeContextLabel,
  safeCoverImageUrl,
  splitDuskTitle,
  stopDateLabel,
  travelModeIsAccented,
  tripScopeLabel,
} from '../app/trip/[id]/mobile/overview-visual.ts'

test('hero copy covers every lifecycle without repeating the countdown', () => {
  assert.deepEqual(heroCopy('undated', {}), {
    badge: 'DATES NOT SET',
    message: 'Add dates to unlock your trip timeline',
  })
  assert.deepEqual(heroCopy('upcoming', { daysUntilStart: 12 }), { badge: 'UPCOMING', message: '12 days away' })
  assert.deepEqual(heroCopy('upcoming', { daysUntilStart: 1 }), { badge: 'UPCOMING', message: 'Tomorrow' })
  assert.deepEqual(heroCopy('upcoming', { daysUntilStart: 0 }), { badge: 'UPCOMING', message: 'Today' })
  assert.deepEqual(heroCopy('active', { dayNumber: 4, totalDays: 12, currentStopName: 'Barcelona' }), {
    badge: 'DAY 4 OF 12',
    message: 'Today in Barcelona',
  })
  assert.deepEqual(heroCopy('completed', {}), { badge: 'COMPLETED', message: 'View trip recap' })
  assert.doesNotMatch(heroCopy('upcoming', { daysUntilStart: 12 }).badge, /12/)
})

test('trip scope uses unique real members only', () => {
  assert.equal(tripScopeLabel([]), null)
  assert.equal(tripScopeLabel([{ user_id: 'a' }]), 'Personal trip')
  assert.equal(tripScopeLabel([{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'b' }]), '2 travelers')
})

test('hero route context follows the current ordered stops', () => {
  assert.equal(routeContextLabel([]), null)
  assert.equal(routeContextLabel([{ name: 'Seattle' }, { name: 'Vancouver' }]), 'Seattle → Vancouver')
  assert.equal(routeContextLabel([{ name: 'Seattle' }, { name: 'Seattle' }]), 'Seattle')
  assert.equal(routeContextLabel([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]), 'A → D')
  assert.equal(routeContextLabel([{ name: 'Seattle' }, { name: 'Page', state: 'AZ' }]), 'Seattle → Page, AZ')
})

test('stops have deterministic ordering and useful date labels', () => {
  const stops = orderStops([
    { id: 'c', order_index: 2 },
    { id: 'b', order_index: 1 },
    { id: 'a', order_index: 1 },
  ])
  assert.deepEqual(stops.map((stop) => stop.id), ['a', 'b', 'c'])
  assert.equal(stopDateLabel({ arrival: '2026-07-10', departure: '2026-07-13' }), 'Jul 10–13')
  assert.equal(stopDateLabel({ arrival: '2026-07-31', departure: '2026-08-02' }), 'Jul 31 – Aug 2')
  assert.equal(stopDateLabel({ arrival: '2026-07-10', departure: '2026-07-10' }), 'Jul 10')
  assert.equal(stopDateLabel({ arrival: null, departure: null }), 'Dates not set')
})

test('progress distinguishes ready, empty and error states', () => {
  assert.deepEqual(preparationProgress('ready', 4, 3), { status: 'ready', value: 75, label: '75% done' })
  assert.deepEqual(preparationProgress('ready', 0, 0), { status: 'empty', label: 'Not started' })
  assert.deepEqual(preparationProgress('error', 0, 0), { status: 'error', label: 'Progress unavailable' })
})

test('only active Travel Mode is accented and completed trips link to recap', () => {
  assert.equal(travelModeIsAccented('active'), true)
  for (const lifecycle of ['undated', 'upcoming', 'completed'] as const) assert.equal(travelModeIsAccented(lifecycle), false)
  assert.equal(photosActionLabel('completed'), 'Trip Recap')
  assert.equal(photosActionLabel('upcoming'), 'Photos')
})

test('cover URLs reject unsafe schemes and accept controlled web or local paths', () => {
  assert.equal(safeCoverImageUrl('javascript:alert(1)'), null)
  assert.equal(safeCoverImageUrl('//example.com/cover.jpg'), null)
  assert.equal(safeCoverImageUrl('/covers/trip.jpg'), '/covers/trip.jpg')
  assert.equal(safeCoverImageUrl('https://images.example/cover.jpg'), 'https://images.example/cover.jpg')
})

test('Dusk titles accent the last word or camel-case segment', () => {
  assert.deepEqual(splitDuskTitle('Mediterranean Summer'), { lead: 'Mediterranean ', accent: 'Summer' })
  assert.deepEqual(splitDuskTitle('RealTrip1'), { lead: 'Real', accent: 'Trip1' })
  assert.deepEqual(splitDuskTitle('Barcelona'), { lead: 'Barcelona', accent: '' })
})

test('visual Overview contract keeps semantic hero, actions, progress and invite controls', () => {
  const source = readFileSync(new URL('../app/trip/[id]/mobile/TripOverviewDomain.tsx', import.meta.url), 'utf8')
  assert.match(source, /<h1\b/)
  assert.match(source, /setCoverFailed\(true\)/)
  assert.match(source, /setDestinationCoverFailed\(true\)/)
  assert.match(source, /useDestinationCover/)
  assert.match(source, /\/api\/places\/photo\?ref=/)
  assert.match(source, /lifecycle === 'completed' \? selectTripPhotoStop\(orderedStops\) : orderedStops\[0\] \?\? null/)
  assert.match(source, /featuredStop=\{photoStop\}/)
  assert.match(source, /selectIconicLandmarkPhoto\(destination, body\?\.results \?\? \[\]\)/)
  assert.match(source, /role="progressbar"/)
  assert.match(source, /aria-valuenow=\{progress\.value\}/)
  assert.match(source, /aria-label="Invite trip member"/)
  assert.match(source, /capabilities\.canManageTrip && !!trip\.invite_code/)
  for (const target of ["onSelectSection('plan')", "onOpenDestination('budget')", "onSelectSection('bookings')", "onOpenDestination('packing')", "onOpenDestination('journal')", "onOpenDestination('travel')"]) {
    assert.ok(source.includes(target), `missing quick action target: ${target}`)
  }
})
