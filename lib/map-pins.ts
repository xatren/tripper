/*
 * Map pin hierarchy for trip stops.
 *
 * A stop that holds nights is where the traveler sleeps, so it defines a trip
 * day and earns a large, day-numbered pin. A 0-night stop is passed through on
 * the way: it stays on the route and on the map, but as a small unlabeled dot
 * that never covers a stay. See docs/overnight-vs-waypoint-plan.md.
 *
 * No `@/` imports and no framework code — this module is exercised directly by
 * the node test runner (tests/map-pin-hierarchy.test.mts).
 */

export type StopPinKind = 'overnight' | 'waypoint'

export interface RouteMapStop {
  id: string
  lat: number
  lng: number
  name: string
  address?: string | null
  /** Nights held. 0 marks a day stop; a missing value predates migration 20260808120000 and reads as one night. */
  nights?: number | null
  /** 1-based trip day the stay starts on — comes from `projectStopSchedule()`. */
  dayStart: number
}

export interface RouteMapPin {
  id: string
  lat: number
  lng: number
  title: string
  subtitle?: string
  kind: StopPinKind
  /** `"3"` for the third overnight stay in route order; null for a waypoint. */
  label: string | null
  /** True when this stay's projected day falls past the trip's date range. Still a real stay — not hidden, not renumbered — just flagged for the popup note. */
  beyondDates: boolean
  role: 'start' | 'end' | 'waypoint'
}

/** Mirrors `stopNights()` in itinerary-projection.ts: `nights` is the single source of truth. */
export function stopPinKind(stop: Pick<RouteMapStop, 'nights'>): StopPinKind {
  return (stop.nights ?? 1) > 0 ? 'overnight' : 'waypoint'
}

const PAST_RETURN_NOTE = 'Past your return date'

/**
 * The badge for the Nth overnight stay in route order — plain "3", not a day
 * number. A multi-night stay pushes the next stay's day far ahead of its route
 * position; counting by calendar day made the sequence look broken ("D2" then
 * "D6") when it was just an honest gap. Counting by stay order instead never
 * skips: the traveler's Nth-place-to-sleep is always N.
 */
export function overnightSequenceLabel(sequence: number): string {
  return String(sequence)
}

/**
 * True when a stay's projected day falls past the trip's last day — the same
 * stops `buildTimeline` drops into `Timeline.overflow`. The stay keeps its
 * sequence badge (unlike the old day-badge scheme, the number was never a
 * calendar claim), but the popup gets a "Past your return date" note so the
 * mismatch isn't silent. `tripDayCount` is null on a trip without a closed
 * date range, where no day can be out of bounds.
 */
export function stopBeyondDates(dayStart: number, tripDayCount: number | null): boolean {
  return tripDayCount != null && Number.isFinite(dayStart) && dayStart > tripDayCount
}

/** Trip days covered by the dates, or null when the trip has no closed range. */
export function tripDayCountFromDates(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null
  const spanMs = new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()
  if (!Number.isFinite(spanMs)) return null
  const days = Math.round(spanMs / 86_400_000) + 1
  return days > 0 ? days : null
}

/**
 * Turns route stops into map pins. Order is preserved — the caller's array stays
 * the route order, and `TripboxMap` owns the paint order that keeps stays above
 * dots.
 */
export function buildRouteMapPins(stops: RouteMapStop[], tripDayCount: number | null): RouteMapPin[] {
  let overnightSeq = 0
  return stops.map((stop, index) => {
    const kind = stopPinKind(stop)
    let label: string | null = null
    let beyondDates = false
    if (kind === 'overnight') {
      overnightSeq += 1
      label = overnightSequenceLabel(overnightSeq)
      beyondDates = stopBeyondDates(stop.dayStart, tripDayCount)
    }
    const address = stop.address ?? undefined
    return {
      id: stop.id,
      lat: stop.lat,
      lng: stop.lng,
      title: stop.name,
      subtitle: beyondDates ? (address ? `${PAST_RETURN_NOTE} · ${address}` : PAST_RETURN_NOTE) : address,
      kind,
      label,
      beyondDates,
      role: index === 0 ? 'start' : index === stops.length - 1 ? 'end' : 'waypoint',
    }
  })
}

/** Pixels below which two waypoints are the same smudge on screen at the current camera. */
export const WAYPOINT_DECLUTTER_GAP_PX = 18

export interface ClusterInput {
  /** Screen-space position at the current camera, from `map.project()`. */
  x: number
  y: number
  kind: StopPinKind
  /** Never collapsed — a selected or just-dropped pin has to keep its own marker. */
  pinned?: boolean
}

export interface WaypointCluster {
  /** Index of the waypoint the bubble sits on — the first of the group along the route. */
  leadIndex: number
  /** Every index in the group, lead first, in route order. */
  memberIndexes: number[]
}

export interface DeclutterResult {
  /** Indexes to draw as ordinary pins. Cluster leads are not here; they draw as bubbles. */
  visibleIndexes: number[]
  /** Groups of two or more waypoints collapsed behind one bubble. */
  clusters: WaypointCluster[]
  /** Indexes a cluster swallowed. Ascending. */
  hiddenIndexes: number[]
}

/**
 * Collapses waypoints that land on top of each other at the current zoom.
 *
 * Geography doesn't decide this — pixels do, so the grouping matches what the
 * traveler actually sees and dissolves on its own as they zoom in. Stays are
 * never collapsed and never absorb a neighbour: the whole point of the hierarchy
 * is that a night on the map is always findable. A pinned waypoint is left alone
 * for the same reason — hiding the marker a popup is anchored to would strand it.
 *
 * Greedy in route order: the first ungrouped waypoint leads, and later waypoints
 * within `gapPx` of *that lead* join it. Measuring against the lead rather than
 * the nearest member keeps a bubble from creeping across the map through a chain
 * of barely-touching stops.
 */
export function declutterWaypoints(
  points: ClusterInput[],
  gapPx: number = WAYPOINT_DECLUTTER_GAP_PX,
): DeclutterResult {
  const visibleIndexes: number[] = []
  const clusters: WaypointCluster[] = []
  const hiddenIndexes: number[] = []
  const claimed = new Set<number>()

  const clusterable = (point: ClusterInput) => point.kind === 'waypoint' && !point.pinned

  for (let i = 0; i < points.length; i += 1) {
    if (claimed.has(i)) continue
    const lead = points[i]
    if (!clusterable(lead)) {
      visibleIndexes.push(i)
      continue
    }
    const memberIndexes = [i]
    for (let j = i + 1; j < points.length; j += 1) {
      if (claimed.has(j) || !clusterable(points[j])) continue
      if (Math.hypot(points[j].x - lead.x, points[j].y - lead.y) >= gapPx) continue
      claimed.add(j)
      memberIndexes.push(j)
    }
    if (memberIndexes.length === 1) {
      visibleIndexes.push(i)
      continue
    }
    clusters.push({ leadIndex: i, memberIndexes })
    hiddenIndexes.push(...memberIndexes.slice(1))
  }

  hiddenIndexes.sort((a, b) => a - b)
  return { visibleIndexes, clusters, hiddenIndexes }
}
