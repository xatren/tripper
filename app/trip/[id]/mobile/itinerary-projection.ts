/*
 * Read adapter between the legacy stop schedule and the unified itinerary
 * (migration 20260716120000_itinerary_items).
 *
 * Contract: an itinerary item is authoritative for whatever it describes; a
 * stop that has no linked item is projected into the timeline as a read-only
 * placeholder derived from the stop schedule. Nothing is written back — old
 * trips keep rendering without any backfill, and linking/creating items
 * gradually replaces projections one stop at a time.
 *
 * No `@/` imports: this module is exercised directly by the node test runner
 * (tests/itinerary-projection.test.mts), which doesn't resolve path aliases.
 * Inputs are structural subsets of the shared types in types/index.ts.
 */

export interface ProjectionStop {
  id: string
  name: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  nights?: number | null
}

export interface ProjectionItem {
  id: string
  stop_id: string | null
  item_type: string
  title: string
  notes: string | null
  start_at: string | null
  end_at: string | null
  all_day: boolean
  local_date: string | null
  timezone: string | null
  order_index: number
  lat: number | null
  lng: number | null
  address: string | null
  estimated_cost: number | null
  currency: string | null
  status: string
  is_locked: boolean
  created_at: string
}

/** One row on the rendered timeline — either a real item or a stop projection. */
export interface TimelineEntry {
  /** Stable render key: `item:<id>` or `stop:<id>`. */
  key: string
  source: 'item' | 'stop'
  id: string
  itemType: string
  title: string
  address: string | null
  lat: number | null
  lng: number | null
  startAt: string | null
  endAt: string | null
  allDay: boolean
  status: string
  isLocked: boolean
  orderIndex: number
  stopId: string | null
  notes: string | null
  estimatedCost: number | null
  currency: string | null
  /** Overlaps another timed entry on the same day (non-destructive warning). */
  conflict: boolean
  /** Stop projections are read-only until a real item replaces them. */
  editable: boolean
}

export interface TimelineDay {
  /** Wall-clock date (YYYY-MM-DD); null on undated trips (day numbers only). */
  date: string | null
  /** 1-based trip day when derivable, else null. */
  dayNumber: number | null
  entries: TimelineEntry[]
}

export interface Timeline {
  days: TimelineDay[]
  /** Items without any date — surfaced in the Unscheduled drawer. */
  unscheduled: TimelineEntry[]
  /**
   * Entries dated outside the trip's visible day range — typically a route that
   * plans more nights than the dates hold. Kept separate so an over-planned
   * route can be reported instead of silently extending the trip's length.
   */
  overflow: TimelineEntry[]
}

const DAY_MS = 86_400_000
/** Safety cap so a typo'd date range can't materialize thousands of day cells. */
const MAX_TRIP_DAYS = 120

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime()
  const to = new Date(`${toISO}T00:00:00`).getTime()
  return Math.round((to - from) / DAY_MS)
}

/**
 * Wall-clock calendar date of an instant in a zone. Falls back to the device
 * zone when `timeZone` is missing or invalid (never throws mid-render).
 */
export function localDateFromInstant(instantISO: string, timeZone?: string | null): string {
  const date = new Date(instantISO)
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone ?? undefined }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(date)
  }
}

/** Day an item belongs to: explicit local_date wins, else derived from start_at. */
export function effectiveLocalDate(item: Pick<ProjectionItem, 'local_date' | 'start_at' | 'timezone'>): string | null {
  if (item.local_date) return item.local_date
  if (item.start_at) return localDateFromInstant(item.start_at, item.timezone)
  return null
}

export interface StopProjectionSchedule {
  stopId: string
  /** Arrival date (YYYY-MM-DD) or null on undated trips. */
  arrival: string | null
  /** 1-based trip day the stay starts on. */
  dayStart: number
  nights: number
}

/**
 * Nights a stop contributes to the trip length. `0` marks a day stop — visited
 * on the way through, adding no day. A missing value means the caller predates
 * migration 20260808120000 and is read as the old implicit single night.
 */
export function stopNights(stop: Pick<ProjectionStop, 'nights'>): number {
  return Math.max(0, stop.nights ?? 1)
}

/**
 * Sequential stay schedule: each stop starts where the previous one ends. Day
 * stops (0 nights) don't advance the cursor, so they land on the day of the leg
 * they sit on — the day the traveler leaves the previous overnight stop.
 */
export function projectStopSchedule(
  tripStartDate: string | null | undefined,
  stops: ProjectionStop[],
): StopProjectionSchedule[] {
  let cursor = tripStartDate ?? null
  let day = 1
  return stops.map((stop) => {
    const nights = stopNights(stop)
    const entry: StopProjectionSchedule = { stopId: stop.id, arrival: cursor, dayStart: day, nights }
    if (cursor) cursor = addDaysISO(cursor, nights)
    day += nights
    return entry
  })
}

function stopToEntry(stop: ProjectionStop, orderIndex: number): TimelineEntry {
  return {
    key: `stop:${stop.id}`,
    source: 'stop',
    id: stop.id,
    itemType: 'place',
    title: stop.name,
    address: stop.address ?? null,
    lat: stop.lat ?? null,
    lng: stop.lng ?? null,
    startAt: null,
    endAt: null,
    allDay: true,
    status: 'planned',
    isLocked: false,
    orderIndex,
    stopId: stop.id,
    notes: null,
    estimatedCost: null,
    currency: null,
    conflict: false,
    editable: false,
  }
}

function itemToEntry(item: ProjectionItem): TimelineEntry {
  return {
    key: `item:${item.id}`,
    source: 'item',
    id: item.id,
    itemType: item.item_type,
    title: item.title,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    startAt: item.start_at,
    endAt: item.end_at,
    allDay: item.all_day,
    status: item.status,
    isLocked: item.is_locked,
    orderIndex: item.order_index,
    stopId: item.stop_id,
    notes: item.notes,
    estimatedCost: item.estimated_cost,
    currency: item.currency,
    conflict: false,
    editable: true,
  }
}

/**
 * Stable within-day order: projected stop arrivals lead (negative orderIndex,
 * ordered among themselves by route position), then
 * saved order, then start time, then creation time, then key — so equal-order
 * rows never swap between renders.
 */
function compareEntries(a: TimelineEntry, b: TimelineEntry, createdAt: Map<string, string>): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
  const aStart = a.startAt ?? ''
  const bStart = b.startAt ?? ''
  if (aStart !== bStart) {
    if (!aStart) return 1
    if (!bStart) return -1
    return aStart < bStart ? -1 : 1
  }
  const aCreated = createdAt.get(a.key) ?? ''
  const bCreated = createdAt.get(b.key) ?? ''
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1
  return a.key < b.key ? -1 : 1
}

/**
 * Flags pairs of timed entries on one day whose intervals overlap. An entry
 * without an end is treated as instantaneous: it conflicts when it falls
 * strictly inside another interval or shares an exact start. Touching
 * boundaries (10–12 then 12–13) do not conflict.
 */
export function markConflicts(entries: TimelineEntry[]): void {
  const timed = entries.filter((entry) => entry.startAt && entry.status !== 'skipped')
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]
      const b = timed[j]
      const aStart = Date.parse(a.startAt as string)
      const bStart = Date.parse(b.startAt as string)
      const aEnd = a.endAt ? Date.parse(a.endAt) : aStart
      const bEnd = b.endAt ? Date.parse(b.endAt) : bStart
      const overlaps = Math.max(aStart, bStart) < Math.min(aEnd, bEnd) || aStart === bStart
      if (overlaps) {
        a.conflict = true
        b.conflict = true
      }
    }
  }
}

export interface BuildTimelineInput {
  tripStartDate?: string | null
  tripEndDate?: string | null
  stops: ProjectionStop[]
  items: ProjectionItem[]
}

/**
 * Merge real itinerary items with stop-schedule projections into day buckets.
 *
 * - Days come from the trip date range when set; item dates outside the range
 *   (and item dates on undated trips) add extra day cells rather than hiding.
 * - Stop projections never widen a trip that has both dates: a route planning
 *   more nights than the range holds lands in `overflow`, not in extra days.
 * - A stop with at least one linked item is represented by its items only.
 * - Items without any date land in `unscheduled`.
 */
export function buildTimeline({ tripStartDate, tripEndDate, stops, items }: BuildTimelineInput): Timeline {
  const linkedStopIds = new Set(items.map((item) => item.stop_id).filter((id): id is string => !!id))
  const schedule = projectStopSchedule(tripStartDate, stops)

  const createdAt = new Map<string, string>()
  for (const item of items) createdAt.set(`item:${item.id}`, item.created_at)

  // Buckets keyed by date for dated days, or by day number for undated trips.
  const dated = new Map<string, TimelineEntry[]>()
  const undatedDays = new Map<number, TimelineEntry[]>()
  const unscheduled: TimelineEntry[] = []

  stops.forEach((stop, index) => {
    if (linkedStopIds.has(stop.id)) return
    // Negative so projections lead the day, offset by route position so several
    // day stops sharing one day appear in the order they're driven through.
    const entry = stopToEntry(stop, index - stops.length)
    const slot = schedule[index]
    if (slot.arrival) {
      const bucket = dated.get(slot.arrival) ?? []
      bucket.push(entry)
      dated.set(slot.arrival, bucket)
    } else {
      const bucket = undatedDays.get(slot.dayStart) ?? []
      bucket.push(entry)
      undatedDays.set(slot.dayStart, bucket)
    }
  })

  // Dates the traveler set explicitly, as opposed to the ones the route implies.
  const itemDates: string[] = []
  for (const item of items) {
    const entry = itemToEntry(item)
    const date = effectiveLocalDate(item)
    if (date) {
      const bucket = dated.get(date) ?? []
      bucket.push(entry)
      dated.set(date, bucket)
      itemDates.push(date)
    } else {
      unscheduled.push(entry)
    }
  }

  // The visible day range: the trip's own dates, widened by dates the traveler
  // set explicitly on an item. Stop projections deliberately do NOT widen a trip
  // that has both dates — an over-planned route (more nights than the range
  // holds) must not silently stretch a 13-day trip into a 22-day one. Without a
  // return date there is no length to respect, so projections still reach.
  const projectionsMayExtend = !(tripStartDate && tripEndDate)
  const widenKeys = [...itemDates]
  if (projectionsMayExtend) {
    for (const slot of schedule) if (slot.arrival) widenKeys.push(slot.arrival)
  }
  widenKeys.sort()
  let rangeStart = tripStartDate ?? null
  let rangeEnd = tripEndDate ?? tripStartDate ?? null
  if (widenKeys.length > 0) {
    if (!rangeStart || widenKeys[0] < rangeStart) rangeStart = widenKeys[0]
    const last = widenKeys[widenKeys.length - 1]
    if (!rangeEnd || last > rangeEnd) rangeEnd = last
  }

  const days: TimelineDay[] = []
  const renderedDates = new Set<string>()

  if (rangeStart && rangeEnd) {
    const span = Math.min(daysBetweenISO(rangeStart, rangeEnd), MAX_TRIP_DAYS - 1)
    for (let offset = 0; offset <= span; offset += 1) {
      const date = addDaysISO(rangeStart, offset)
      renderedDates.add(date)
      const entries = dated.get(date) ?? []
      entries.sort((a, b) => compareEntries(a, b, createdAt))
      markConflicts(entries)
      const dayNumber = tripStartDate ? daysBetweenISO(tripStartDate, date) + 1 : null
      days.push({ date, dayNumber, entries })
    }
  }

  // Whatever landed on a date the range doesn't cover — a route planning more
  // nights than the trip's dates hold, or a date past MAX_TRIP_DAYS. Surfaced
  // rather than dropped, so nothing disappears without a trace.
  const overflow: TimelineEntry[] = []
  for (const [date, entries] of dated) {
    if (!renderedDates.has(date)) overflow.push(...entries)
  }

  // Undated trips: day cells numbered from the stop schedule.
  const numberedDays = [...undatedDays.keys()].sort((a, b) => a - b)
  for (const dayNumber of numberedDays) {
    const entries = undatedDays.get(dayNumber) as TimelineEntry[]
    entries.sort((a, b) => compareEntries(a, b, createdAt))
    markConflicts(entries)
    days.push({ date: null, dayNumber, entries })
  }

  unscheduled.sort((a, b) => compareEntries(a, b, createdAt))
  overflow.sort((a, b) => compareEntries(a, b, createdAt))

  return { days, unscheduled, overflow }
}
