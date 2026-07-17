/*
 * Pure day-route-optimization planner. Given one day's itinerary items (already
 * sorted by order_index), decides which contiguous runs of items are safe to
 * geographically reorder, asks the injected Mapbox helpers for a candidate
 * order per run, checks that candidate against any real fixed-time windows,
 * and stitches the results back into one full-day order.
 *
 * Anchor rule: the first item, the last item, any `isLocked` item, and any
 * item without coordinates never move. This one rule covers both "keep the
 * day's start/end fixed" and "locked reservations stay put" from the product
 * spec, and mirrors the existing trip-level `source=first&destination=last`
 * convention in lib/mapbox/optimize.ts. Between two consecutive anchors, the
 * run of movable items in between is an independent "segment" — segments
 * are optimized and can fail independently, so one bad segment (missing
 * coordinates, over the Mapbox waypoint cap, an infeasible time window)
 * never blocks the rest of the day.
 *
 * No `@/` imports and no network calls in this module: the Mapbox/Directions
 * calls are injected as `DayOptimizationDeps` so this file stays runnable
 * under the bare node test runner (see tests/route-optimizer.test.mts),
 * exactly like ../itinerary-projection.ts.
 *
 * Extension points intentionally NOT implemented here (no verified data
 * source exists in this schema for them): opening hours, live traffic,
 * weather, golden hour / sunset timing, scenic-route preference, EV
 * charging stops. Wire these in as additional feasibility/scoring inputs
 * once real data is available — never as fabricated scores.
 */

export interface DayItem {
  id: string
  lat: number | null
  lng: number | null
  isLocked: boolean
  /** ISO instant; only set for time-anchored items (e.g. a locked reservation). */
  startAt: string | null
  endAt: string | null
  durationMinutes: number | null
}

interface LatLng {
  lat: number
  lng: number
}

export type SegmentSkipReason =
  | 'too_few_movable'
  | 'too_many_points'
  | 'missing_coordinates'
  | 'duplicate_coordinates'

export interface DaySegment {
  /** Indices into the sorted `items` array that make up this movable run. */
  movableIndices: number[]
  leftAnchorIndex: number
  rightAnchorIndex: number
  /** null when the segment is eligible for a Mapbox Optimization call. */
  skip: SegmentSkipReason | null
}

const MAPBOX_OPTIMIZE_MAX_POINTS = 12

function hasCoords(item: DayItem): boolean {
  return item.lat != null && item.lng != null
}

function isAnchor(items: DayItem[], index: number): boolean {
  return index === 0 || index === items.length - 1 || items[index].isLocked || !hasCoords(items[index])
}

function coordKey(item: DayItem): string {
  return `${item.lat},${item.lng}`
}

function segmentBoundaryHasCoords(items: DayItem[], segment: { leftAnchorIndex: number; rightAnchorIndex: number }): boolean {
  return hasCoords(items[segment.leftAnchorIndex]) && hasCoords(items[segment.rightAnchorIndex])
}

function classifySegmentSkip(items: DayItem[], movableIndices: number[], leftAnchorIndex: number, rightAnchorIndex: number): SegmentSkipReason | null {
  if (movableIndices.length < 2) return 'too_few_movable'
  const totalPoints = movableIndices.length + 2 // + left/right anchors
  if (totalPoints > MAPBOX_OPTIMIZE_MAX_POINTS) return 'too_many_points'
  if (!segmentBoundaryHasCoords(items, { leftAnchorIndex, rightAnchorIndex })) return 'missing_coordinates'
  const seen = new Set<string>()
  const points = [items[leftAnchorIndex], ...movableIndices.map((i) => items[i]), items[rightAnchorIndex]]
  for (const point of points) {
    const key = coordKey(point)
    if (seen.has(key)) return 'duplicate_coordinates'
    seen.add(key)
  }
  return null
}

/**
 * Splits a day's items into anchor-bounded segments. Every segment has both
 * a left and right anchor because index 0 and index length-1 are always
 * anchors by definition; only interior non-anchor runs become segments.
 */
export function buildDaySegments(items: DayItem[]): DaySegment[] {
  const segments: DaySegment[] = []
  let current: number[] = []
  let lastAnchorIndex = -1
  items.forEach((_, index) => {
    if (isAnchor(items, index)) {
      if (current.length > 0) {
        segments.push({
          movableIndices: current,
          leftAnchorIndex: lastAnchorIndex,
          rightAnchorIndex: index,
          skip: classifySegmentSkip(items, current, lastAnchorIndex, index),
        })
        current = []
      }
      lastAnchorIndex = index
    } else {
      current.push(index)
    }
  })
  return segments
}

export function skipReasonMessage(reason: SegmentSkipReason): string {
  switch (reason) {
    case 'too_few_movable':
      return 'Fewer than 2 movable items between fixed points — nothing to reorder.'
    case 'too_many_points':
      return `More than ${MAPBOX_OPTIMIZE_MAX_POINTS} points in this section — Mapbox can't optimize it in one request.`
    case 'missing_coordinates':
      return "One of this section's fixed points has no location — can't anchor the route there."
    case 'duplicate_coordinates':
      return 'Two items in this section share the exact same location.'
    default:
      return 'This section was skipped.'
  }
}

export interface SegmentFeasibility {
  feasible: boolean
  /** Set when infeasible; human-readable explanation of which constraint failed. */
  reason?: string
}

/**
 * Only evaluated when both bounding anchors carry real timestamps — otherwise
 * there is nothing honest to check, and the segment is treated as feasible.
 * Required time = each movable item's known duration_minutes (0 when unset)
 * plus the optimized segment's actual driving duration.
 */
export function checkSegmentFeasibility(
  items: DayItem[],
  segment: DaySegment,
  movableDurationSeconds: number,
): SegmentFeasibility {
  const left = items[segment.leftAnchorIndex]
  const right = items[segment.rightAnchorIndex]
  if (!left.endAt || !right.startAt) return { feasible: true }
  const availableMs = Date.parse(right.startAt) - Date.parse(left.endAt)
  if (!Number.isFinite(availableMs) || availableMs <= 0) return { feasible: true }
  const requiredVisitSeconds = segment.movableIndices.reduce((sum, i) => sum + (items[i].durationMinutes ?? 0) * 60, 0)
  const requiredMs = (requiredVisitSeconds + movableDurationSeconds) * 1000
  if (requiredMs <= availableMs) return { feasible: true }
  const overMin = Math.ceil((requiredMs - availableMs) / 60000)
  return {
    feasible: false,
    reason: `Needs about ${overMin} more minute${overMin === 1 ? '' : 's'} than the ${fmtWindow(left.endAt, right.startAt)} window allows.`,
  }
}

function fmtWindow(fromISO: string, toISO: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  try {
    return `${new Intl.DateTimeFormat(undefined, opts).format(new Date(fromISO))}–${new Intl.DateTimeFormat(undefined, opts).format(new Date(toISO))}`
  } catch {
    return 'available'
  }
}

export interface DayOptimizationDeps {
  getOptimizedOrder: (points: LatLng[], opts?: { signal?: AbortSignal }) => Promise<{ order: number[]; distanceMeters: number; durationSeconds: number } | null>
  getFullRoute: (points: LatLng[], opts?: { signal?: AbortSignal }) => Promise<{ legs: { distanceMeters: number; durationSeconds: number }[] } | null>
  signal?: AbortSignal
}

export interface SkippedSegmentInfo {
  itemIds: string[]
  reason: SegmentSkipReason | 'infeasible' | 'api_error'
  message: string
}

export interface DayOptimizationPreview {
  /** Full day order (all item ids, geo and non-geo) after applying every feasible segment reorder. */
  order: string[]
  movedItemIds: string[]
  lockedItemIds: string[]
  currentDistanceMeters: number
  currentDurationSeconds: number
  optimizedDistanceMeters: number
  optimizedDurationSeconds: number
  savedDistanceMeters: number
  savedDurationSeconds: number
  skippedSegments: SkippedSegmentInfo[]
  changed: boolean
}

export type DayOptimizationOutcome =
  | { ok: false; reason: 'too_few_items'; message: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'network_error'; message: string }
  | { ok: true; preview: DayOptimizationPreview }

function toLatLng(item: DayItem): LatLng {
  return { lat: item.lat as number, lng: item.lng as number }
}

function sumRoute(route: { legs: { distanceMeters: number; durationSeconds: number }[] } | null) {
  if (!route) return null
  return route.legs.reduce(
    (acc, leg) => ({ distanceMeters: acc.distanceMeters + leg.distanceMeters, durationSeconds: acc.durationSeconds + leg.durationSeconds }),
    { distanceMeters: 0, durationSeconds: 0 },
  )
}

/**
 * Plans (but does not persist) a full-day route optimization. Callers apply
 * the returned `order` only after the user confirms the preview.
 */
export async function planDayOptimization(items: DayItem[], deps: DayOptimizationDeps): Promise<DayOptimizationOutcome> {
  const geoCount = items.filter(hasCoords).length
  if (geoCount < 3) {
    return { ok: false, reason: 'too_few_items', message: 'Add at least 3 located items to this day to optimize its route.' }
  }

  const segments = buildDaySegments(items)
  const finalOrder = items.map((_, index) => index)
  const skippedSegments: SkippedSegmentInfo[] = []

  for (const segment of segments) {
    if (deps.signal?.aborted) return { ok: false, reason: 'cancelled' }

    if (segment.skip) {
      skippedSegments.push({
        itemIds: segment.movableIndices.map((i) => items[i].id),
        reason: segment.skip,
        message: skipReasonMessage(segment.skip),
      })
      continue
    }

    const points = [items[segment.leftAnchorIndex], ...segment.movableIndices.map((i) => items[i]), items[segment.rightAnchorIndex]].map(toLatLng)
    const result = await deps.getOptimizedOrder(points, { signal: deps.signal })
    if (!result) {
      skippedSegments.push({
        itemIds: segment.movableIndices.map((i) => items[i].id),
        reason: 'api_error',
        message: "Couldn't compute a route for this section.",
      })
      continue
    }

    const feasibility = checkSegmentFeasibility(items, segment, result.durationSeconds)
    if (!feasibility.feasible) {
      skippedSegments.push({
        itemIds: segment.movableIndices.map((i) => items[i].id),
        reason: 'infeasible',
        message: feasibility.reason ?? 'This section would not fit its fixed time window.',
      })
      continue
    }

    // result.order[k] = index into `points` of the point now at optimized position k.
    // Position 0/last are the anchors (source=first/destination=last); the
    // middle maps 1:1 back onto segment.movableIndices.
    const newMovableOrder = result.order.slice(1, -1).map((pointIndex) => pointIndex - 1)
    newMovableOrder.forEach((originalMovablePos, k) => {
      finalOrder[segment.movableIndices[k]] = segment.movableIndices[originalMovablePos]
    })
  }

  if (deps.signal?.aborted) return { ok: false, reason: 'cancelled' }

  const origGeoPoints = items.filter(hasCoords).map(toLatLng)
  const finalItems = finalOrder.map((index) => items[index])
  const finalGeoPoints = finalItems.filter(hasCoords).map(toLatLng)

  const [currentRoute, optimizedRoute] = await Promise.all([
    deps.getFullRoute(origGeoPoints, { signal: deps.signal }),
    deps.getFullRoute(finalGeoPoints, { signal: deps.signal }),
  ])
  if (deps.signal?.aborted) return { ok: false, reason: 'cancelled' }

  const current = sumRoute(currentRoute)
  const optimized = sumRoute(optimizedRoute)
  if (!current || !optimized) {
    return { ok: false, reason: 'network_error', message: "Couldn't compute the route for this day. Please try again." }
  }

  const movedItemIds = finalOrder
    .map((originalIndex, position) => (originalIndex !== position ? items[originalIndex].id : null))
    .filter((id): id is string => id !== null)

  return {
    ok: true,
    preview: {
      order: finalItems.map((item) => item.id),
      movedItemIds,
      lockedItemIds: items.filter((item) => item.isLocked).map((item) => item.id),
      currentDistanceMeters: current.distanceMeters,
      currentDurationSeconds: current.durationSeconds,
      optimizedDistanceMeters: optimized.distanceMeters,
      optimizedDurationSeconds: optimized.durationSeconds,
      savedDistanceMeters: current.distanceMeters - optimized.distanceMeters,
      savedDurationSeconds: current.durationSeconds - optimized.durationSeconds,
      skippedSegments,
      changed: movedItemIds.length > 0,
    },
  }
}
