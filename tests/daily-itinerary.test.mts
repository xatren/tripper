import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  adjacentDailyDayId,
  currentTimeInsertIndex,
  dailyDayId,
  dailyRouteMode,
  dailyRouteTitle,
  mappedDailyEntries,
  overnightBaseByDay,
  resolveInitialDailyDayId,
  shouldShowCurrentTime,
} from '../app/trip/[id]/mobile/itinerary/daily-itinerary.ts'

const days = [
  { date: '2026-07-14', dayNumber: 1, entries: [] },
  { date: '2026-07-15', dayNumber: 2, entries: [{ startAt: '2026-07-15T10:00:00Z', lat: 40, lng: 29 }] },
  { date: '2026-07-16', dayNumber: 3, entries: [{ startAt: null, lat: null, lng: null }] },
]

test('initial daily day selection honors deep links and lifecycle fallbacks', () => {
  assert.equal(resolveInitialDailyDayId(days, { requestedDay: '3', today: '2026-07-15', lifecycle: 'active' }), '2026-07-16')
  assert.equal(resolveInitialDailyDayId(days, { requestedDay: 'invalid', today: '2026-07-15', lifecycle: 'active' }), '2026-07-15')
  assert.equal(resolveInitialDailyDayId(days, { today: '2026-07-01', lifecycle: 'upcoming' }), '2026-07-14')
  assert.equal(resolveInitialDailyDayId(days, { today: '2026-08-01', lifecycle: 'completed' }), '2026-07-16')
  assert.equal(resolveInitialDailyDayId([{ date: null, dayNumber: 1, entries: [] }, { date: null, dayNumber: 2, entries: days[1].entries }], { today: '2026-07-15', lifecycle: 'undated' }), 'n2')
  assert.equal(resolveInitialDailyDayId([], { today: '2026-07-15', lifecycle: 'undated' }), null)
})

test('previous and next navigation stop at day bounds', () => {
  assert.equal(adjacentDailyDayId(days, dailyDayId(days[0]), -1), null)
  assert.equal(adjacentDailyDayId(days, dailyDayId(days[0]), 1), '2026-07-15')
  assert.equal(adjacentDailyDayId(days, dailyDayId(days[2]), 1), null)
})

test('route preview distinguishes no map, marker-only, and real directions modes', () => {
  assert.equal(dailyRouteMode(0), 'fallback')
  assert.equal(dailyRouteMode(1), 'markers')
  assert.equal(dailyRouteMode(4), 'directions')
  assert.equal(dailyRouteTitle({ dayNumber: 3 }, 0, false), 'Day 3 route')
  assert.equal(dailyRouteTitle({ dayNumber: 3 }, 1, false), 'Day 3 locations')
  assert.equal(dailyRouteTitle({ dayNumber: 3 }, 4, true), "Today's route")
  assert.equal(mappedDailyEntries(days[2]).length, 0)
  assert.equal(mappedDailyEntries(days[1]).length, 1)
})

test('current time marker is limited to active today and inserted chronologically', () => {
  assert.equal(shouldShowCurrentTime('active', days[1], '2026-07-15'), true)
  assert.equal(shouldShowCurrentTime('active', days[1], '2026-07-16'), false)
  assert.equal(shouldShowCurrentTime('upcoming', days[1], '2026-07-15'), false)
  assert.equal(currentTimeInsertIndex([
    { startAt: '2026-07-15T09:00:00Z', lat: null, lng: null },
    { startAt: '2026-07-15T11:00:00Z', lat: null, lng: null },
  ], new Date('2026-07-15T10:00:00Z')), 1)
})

test('every night of a stay names its base; day stops are nobody\'s base', () => {
  // Seattle (2 nights from day 1) → Astoria (day stop) → Portland (3 nights).
  const base = overnightBaseByDay([
    { dayStart: 1, nights: 2, name: 'Seattle' },
    { dayStart: 3, nights: 0, name: 'Astoria' },
    { dayStart: 3, nights: 3, name: 'Portland' },
  ])
  assert.equal(base.get(1), 'Seattle')
  // Night 2 of the stay: the stop projection is back on day 1, so this is the
  // only thing that can still say where the traveler is sleeping.
  assert.equal(base.get(2), 'Seattle')
  // Day 3 is the drive to Portland, past Astoria — the bed at the end wins.
  assert.equal(base.get(3), 'Portland')
  assert.equal(base.get(5), 'Portland')
  // Day 6 is the morning they move on: no night, so no base.
  assert.equal(base.get(6), undefined)
})

test('a route with no overnight stops leaves every day without a base', () => {
  assert.equal(overnightBaseByDay([{ dayStart: 1, nights: 0, name: 'Viewpoint' }]).size, 0)
})

test('a nonsense night count cannot fill more days than can ever be rendered', () => {
  assert.equal(overnightBaseByDay([{ dayStart: 1, nights: 9999, name: 'Forever' }]).size, 120)
})

test('the daily header names the night, and the timeline feeds it by day number', () => {
  const view = readFileSync(new URL('../app/trip/[id]/mobile/itinerary/DailyItineraryView.tsx', import.meta.url), 'utf8')
  const timeline = readFileSync(new URL('../app/trip/[id]/mobile/itinerary/ItineraryTimeline.tsx', import.meta.url), 'utf8')
  assert.match(view, /Night in \{overnightBase\}/)
  assert.match(timeline, /overnightBase=\{selectedDay\.dayNumber != null \? overnightBase\.get\(selectedDay\.dayNumber\) \?\? null : null\}/)
  // The undated day strip's sublabel used to look up `.get('')` and always miss.
  assert.match(timeline, /\(day\.dayNumber != null \? overnightBase\.get\(day\.dayNumber\) : undefined\)/)
})

test('Screen 02 opens the standalone daily screen and the shared controller is single-mounted', () => {
  const overview = readFileSync(new URL('../app/trip/[id]/mobile/TripOverviewDomain.tsx', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../app/trip/[id]/mobile/TripMobileClient.tsx', import.meta.url), 'utf8')
  const plan = readFileSync(new URL('../app/trip/[id]/mobile/PlanRouteDomain.tsx', import.meta.url), 'utf8')
  const row = readFileSync(new URL('../app/trip/[id]/mobile/itinerary/ItineraryItemRow.tsx', import.meta.url), 'utf8')
  assert.match(overview, /label: 'Itinerary'.*onClick: onOpenItinerary/)
  assert.match(client, /onOpenItinerary=\{openDailyItinerary\}/)
  assert.match(client, /variant="daily"/)
  assert.match(plan, /activeTab === 'days' && !suppressItinerary/)
  for (const state of ['completed', 'skipped', 'arrived', 'on_the_way']) assert.ok(row.includes(`entry.status === '${state}'`))
  assert.match(row, /Conflict/)
  assert.match(row, /From route/)
})

