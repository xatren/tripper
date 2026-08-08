import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildRouteMapPins,
  declutterWaypoints,
  overnightSequenceLabel,
  stopBeyondDates,
  stopPinKind,
  tripDayCountFromDates,
  WAYPOINT_DECLUTTER_GAP_PX,
  type ClusterInput,
  type RouteMapStop,
} from '../lib/map-pins.ts'

/** A (2 nights) → W1, W2 (day stops) → B (1 night), matching the plan's worked example. */
function routeStops(): RouteMapStop[] {
  return [
    { id: 'a', lat: 1, lng: 1, name: 'A', address: 'A st', nights: 2, dayStart: 1 },
    { id: 'w1', lat: 2, lng: 2, name: 'W1', address: null, nights: 0, dayStart: 3 },
    { id: 'w2', lat: 3, lng: 3, name: 'W2', nights: 0, dayStart: 3 },
    { id: 'b', lat: 4, lng: 4, name: 'B', nights: 1, dayStart: 3 },
  ]
}

test('nights alone decides whether a stop is a stay or a waypoint', () => {
  assert.equal(stopPinKind({ nights: 2 }), 'overnight')
  assert.equal(stopPinKind({ nights: 1 }), 'overnight')
  assert.equal(stopPinKind({ nights: 0 }), 'waypoint')
  // Rows written before migration 20260808120000 carry no nights and mean one.
  assert.equal(stopPinKind({ nights: null }), 'overnight')
  assert.equal(stopPinKind({}), 'overnight')
})

test('overnight pins are labelled by stay order; waypoints carry no label', () => {
  const pins = buildRouteMapPins(routeStops(), 4)
  assert.deepEqual(pins.map((pin) => [pin.kind, pin.label]), [
    ['overnight', '1'],
    ['waypoint', null],
    ['waypoint', null],
    ['overnight', '2'],
  ])
})

test('a multi-night stay does not make the next badge skip numbers', () => {
  // A (4 nights) -> B (1 night) -> C (1 night): B starts on day 5, C on day 6,
  // but they are only the 2nd and 3rd places the traveler sleeps.
  const stops: RouteMapStop[] = [
    { id: 'a', lat: 1, lng: 1, name: 'A', nights: 4, dayStart: 1 },
    { id: 'b', lat: 2, lng: 2, name: 'B', nights: 1, dayStart: 5 },
    { id: 'c', lat: 3, lng: 3, name: 'C', nights: 1, dayStart: 6 },
  ]
  const pins = buildRouteMapPins(stops, 13)
  assert.deepEqual(pins.map((pin) => pin.label), ['1', '2', '3'])
})

test('a stay past the trip dates keeps its sequence badge but is flagged beyond the dates', () => {
  // RealTrip1's shape: more nights planned than the dates hold.
  const overplanned: RouteMapStop[] = [
    { id: 'in', lat: 1, lng: 1, name: 'In range', nights: 1, dayStart: 13 },
    { id: 'out', lat: 2, lng: 2, name: 'Out of range', address: 'Far away', nights: 1, dayStart: 14 },
  ]
  const pins = buildRouteMapPins(overplanned, 13)
  assert.equal(pins[0].label, '1')
  assert.equal(pins[1].label, '2')
  assert.equal(pins[0].beyondDates, false)
  assert.equal(pins[1].beyondDates, true)
  // Still a full-size stay pin — the flag doesn't hide it or drop its place on the map.
  assert.equal(pins[1].kind, 'overnight')
  // ...and the popup says why instead of leaving a silent blank.
  assert.equal(pins[1].subtitle, 'Past your return date · Far away')
  assert.equal(pins[0].subtitle, undefined)
})

test('a route with every night cleared is all dots, and no stop leaves the map', () => {
  // The state Phase 5's "Make all day stops" leaves behind.
  const cleared: RouteMapStop[] = Array.from({ length: 4 }, (_unused, i) => ({
    id: `s${i}`, lat: i, lng: i, name: `Stop ${i}`, nights: 0, dayStart: 1,
  }))
  const pins = buildRouteMapPins(cleared, 13)
  assert.equal(pins.length, 4)
  assert.ok(pins.every((pin) => pin.kind === 'waypoint' && pin.label === null))
  // No "past your return date" note either — a stop holding no night has no day
  // of its own to overrun, so the warning would say nothing true.
  assert.ok(pins.every((pin) => pin.subtitle === undefined && pin.beyondDates === false))
  // The route still reads end to end, with nothing to sleep in.
  assert.deepEqual(pins.map((pin) => pin.role), ['start', 'waypoint', 'waypoint', 'end'])
})

test('an open-ended trip has no last day, so no day number can be out of bounds', () => {
  assert.equal(tripDayCountFromDates('2026-06-01', '2026-06-13'), 13)
  assert.equal(tripDayCountFromDates('2026-06-01', null), null)
  assert.equal(tripDayCountFromDates(null, '2026-06-13'), null)
  assert.equal(overnightSequenceLabel(3), '3')
  assert.equal(stopBeyondDates(22, 13), true)
  assert.equal(stopBeyondDates(13, 13), false)
  assert.equal(stopBeyondDates(22, null), false)
})

test('route roles stay on the outer stops regardless of kind', () => {
  const pins = buildRouteMapPins(routeStops(), 4)
  assert.deepEqual(pins.map((pin) => pin.role), ['start', 'waypoint', 'waypoint', 'end'])
})

test('TripboxMap draws stays large and glowing, waypoints small and flat', () => {
  const source = readFileSync(new URL('../components/map/mapbox/TripboxMap.tsx', import.meta.url), 'utf8')

  assert.match(source, /const size = waypoint \? \(selected \? 22 : 13\) : \(selected \? 38 : 32\)/)
  assert.match(source, /border: `\$\{waypoint \? 1\.5 : 3\}px \$\{unresolvedOvernight \? 'dashed' : 'solid'\}/)
  assert.match(source, /: waypoint \? 'none' : '0 0 12px rgba\(245,140,0,\.45\)'/)
  assert.match(source, /const WAYPOINT_COLOR = '#77779a'/)
  // A waypoint never renders a badge, whatever label a caller passes.
  assert.match(source, /\{!waypoint && label != null &&/)
})

test('an overnight stay past the trip dates draws dashed and faded instead of a plain full pin', () => {
  const source = readFileSync(new URL('../components/map/mapbox/TripboxMap.tsx', import.meta.url), 'utf8')
  assert.match(source, /const unresolvedOvernight = !waypoint && p\.beyondDates === true/)
  assert.match(source, /opacity: p\.emphasis === 'dimmed' \? \.35 : unresolvedOvernight \? \.55 : 1/)
  assert.match(source, /\{unresolvedOvernight && \(/)
})

test('kind beats compact, and a caller without either keeps the legacy numbered pin', () => {
  const source = readFileSync(new URL('../components/map/mapbox/TripboxMap.tsx', import.meta.url), 'utf8')
  assert.match(source, /function resolvePinKind[\s\S]*?if \(point\.kind\) return point\.kind[\s\S]*?return point\.compact \? 'waypoint' : 'overnight'/)
  // Legacy callers still get the array-position fallback; `kind` callers own their labels.
  assert.match(source, /const label = p\.kind \? p\.label : p\.label \?\? index \+ 1/)
})

test('waypoints paint first so a stay is never buried under a dot', () => {
  const source = readFileSync(new URL('../components/map/mapbox/TripboxMap.tsx', import.meta.url), 'utf8')
  assert.match(source, /\.sort\(\(a, b\) => \(a\.kind === b\.kind \? a\.index - b\.index : a\.kind === 'waypoint' \? -1 : 1\)\)/)
  // The label fallback must read the original route position, not the paint slot.
  assert.match(source, /\.map\(\(point, index\) => \(\{ point, index, kind: resolvePinKind\(point\) \}\)\)/)
  assert.match(source, /paintOrder\.map\(\(\{ point: p, index, kind \}, slot\)/)
})

test('waypoints sharing a spot on screen collapse into one bubble', () => {
  const points: ClusterInput[] = [
    { x: 100, y: 100, kind: 'waypoint' },
    { x: 104, y: 103, kind: 'waypoint' },
    { x: 108, y: 99, kind: 'waypoint' },
    { x: 400, y: 400, kind: 'waypoint' },
  ]
  const result = declutterWaypoints(points)
  assert.deepEqual(result.clusters, [{ leadIndex: 0, memberIndexes: [0, 1, 2] }])
  assert.deepEqual(result.hiddenIndexes, [1, 2])
  // The lead draws as a bubble, so only the distant waypoint is an ordinary pin.
  assert.deepEqual(result.visibleIndexes, [3])
})

test('a stay is never collapsed and never swallows a neighbour', () => {
  const points: ClusterInput[] = [
    { x: 100, y: 100, kind: 'overnight' },
    { x: 101, y: 101, kind: 'overnight' },
    { x: 102, y: 102, kind: 'waypoint' },
  ]
  const result = declutterWaypoints(points)
  assert.deepEqual(result.clusters, [])
  assert.deepEqual(result.hiddenIndexes, [])
  assert.deepEqual(result.visibleIndexes, [0, 1, 2])
})

test('the selected and just-dropped pins keep their own marker inside a crowd', () => {
  const points: ClusterInput[] = [
    { x: 100, y: 100, kind: 'waypoint' },
    { x: 101, y: 100, kind: 'waypoint', pinned: true },
    { x: 102, y: 100, kind: 'waypoint' },
  ]
  const result = declutterWaypoints(points)
  assert.deepEqual(result.clusters, [{ leadIndex: 0, memberIndexes: [0, 2] }])
  // Hiding the marker a popup is anchored to would strand it.
  assert.ok(result.visibleIndexes.includes(1))
  assert.deepEqual(result.hiddenIndexes, [2])
})

test('the bubble measures from its lead, so it cannot creep across a chain of stops', () => {
  const gap = WAYPOINT_DECLUTTER_GAP_PX
  const points: ClusterInput[] = [
    { x: 0, y: 0, kind: 'waypoint' },
    { x: gap - 2, y: 0, kind: 'waypoint' },
    // Within reach of the middle pin, but not of the lead — its own group.
    { x: (gap - 2) * 2, y: 0, kind: 'waypoint' },
  ]
  const result = declutterWaypoints(points)
  assert.deepEqual(result.clusters, [{ leadIndex: 0, memberIndexes: [0, 1] }])
  assert.deepEqual(result.visibleIndexes, [2])
})

test('zooming in dissolves a group: the same stops at a wider spread stay separate', () => {
  const tight: ClusterInput[] = [
    { x: 100, y: 100, kind: 'waypoint' },
    { x: 110, y: 100, kind: 'waypoint' },
  ]
  const spread: ClusterInput[] = [
    { x: 100, y: 100, kind: 'waypoint' },
    { x: 100 + WAYPOINT_DECLUTTER_GAP_PX, y: 100, kind: 'waypoint' },
  ]
  assert.equal(declutterWaypoints(tight).clusters.length, 1)
  assert.equal(declutterWaypoints(spread).clusters.length, 0)
})

test('TripboxMap re-measures when the camera settles and lets a bubble be opened', () => {
  const source = readFileSync(new URL('../components/map/mapbox/TripboxMap.tsx', import.meta.url), 'utf8')
  assert.match(source, /onMoveEnd=\{handleMoveEnd\}/)
  assert.match(source, /const \{ x, y \} = map\.project\(\[point\.lng, point\.lat\]\)/)
  assert.match(source, /pinned: point\.id === selectedId \|\| point\.id === dropInId/)
  assert.match(source, /if \(hiddenSlots\.has\(slot\)\) return null/)
  assert.match(source, /zoom: map\.getZoom\(\) \+ 2/)
  assert.match(source, /\+\{count\}/)
})

test('the Plan route map feeds pins from the stop schedule, not the stop order', () => {
  const source = readFileSync(new URL('../app/trip/[id]/mobile/PlanRouteDomain.tsx', import.meta.url), 'utf8')
  assert.match(source, /import \{ buildTimeline, projectStopSchedule \} from '\.\/itinerary-projection'/)
  assert.match(source, /dayStart: schedule\[index\]\.dayStart/)
  assert.match(source, /buildRouteMapPins\(routeMapStops, tripDayCountFromDates\(trip\.start_date, trip\.end_date\)\)/)
  // The old ordinal labelling is gone.
  assert.doesNotMatch(source, /label: index \+ 1/)
})
