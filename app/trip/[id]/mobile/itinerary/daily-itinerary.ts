export interface DailyTimelineEntry {
  startAt: string | null
  lat: number | null
  lng: number | null
}

export interface DailyTimelineDay<TEntry extends DailyTimelineEntry = DailyTimelineEntry> {
  date: string | null
  dayNumber: number | null
  entries: TEntry[]
}

export type DailyTripLifecycle = 'upcoming' | 'active' | 'completed' | 'undated'

export function dailyDayId(day: Pick<DailyTimelineDay, 'date' | 'dayNumber'>): string {
  return day.date ?? `n${day.dayNumber ?? 0}`
}

export function resolveInitialDailyDayId(
  days: DailyTimelineDay[],
  options: { requestedDay?: string | null; today: string; lifecycle: DailyTripLifecycle },
): string | null {
  if (days.length === 0) return null

  const requested = options.requestedDay?.trim()
  if (requested) {
    const matched = days.find((day) => (
      dailyDayId(day) === requested ||
      day.date === requested ||
      (day.dayNumber != null && String(day.dayNumber) === requested)
    ))
    if (matched) return dailyDayId(matched)
  }

  if (options.lifecycle === 'active') {
    const todayCell = days.find((day) => day.date === options.today)
    if (todayCell) return dailyDayId(todayCell)
  }

  if (options.lifecycle === 'completed') {
    const lastMeaningful = [...days].reverse().find((day) => day.entries.length > 0)
    return dailyDayId(lastMeaningful ?? days[days.length - 1])
  }

  if (options.lifecycle === 'undated') {
    const firstAvailable = days.find((day) => day.entries.length > 0)
    return dailyDayId(firstAvailable ?? days[0])
  }

  return dailyDayId(days[0])
}

export function adjacentDailyDayId(days: DailyTimelineDay[], selectedId: string | null, delta: -1 | 1): string | null {
  const index = days.findIndex((day) => dailyDayId(day) === selectedId)
  if (index < 0) return days.length > 0 ? dailyDayId(days[0]) : null
  const nextIndex = index + delta
  return nextIndex >= 0 && nextIndex < days.length ? dailyDayId(days[nextIndex]) : null
}

export function mappedDailyEntries<TEntry extends DailyTimelineEntry>(day: DailyTimelineDay<TEntry> | null): TEntry[] {
  return day?.entries.filter((entry) => entry.lat != null && entry.lng != null) ?? []
}

export interface OvernightStay {
  /** 1-based trip day the stay starts on — from `projectStopSchedule()`. */
  dayStart: number
  /** Nights held. 0 is a day stop, which is nobody's base. */
  nights: number
  name: string
}

/**
 * Cap mirroring `MAX_TRIP_DAYS` in itinerary-projection.ts: a nonsense night
 * count on one row must not spin this loop past any day that can be rendered.
 */
const MAX_TRIP_DAY = 120

/**
 * Which stop the traveler sleeps at on each trip day.
 *
 * A stay of N nights starting on day D covers nights D…D+N-1; day D+N is the
 * morning they move on, and belongs to whatever comes next. Day stops hold no
 * night, so they are never a base.
 *
 * Keyed by day number rather than date, which keeps this free of date
 * arithmetic — every caller already has `dayNumber` on its `TimelineDay`, and an
 * undated trip has nothing else. A later stay wins a collision: two stays
 * claiming one night means an over-planned route, and the later one is where the
 * traveler would have driven to.
 */
export function overnightBaseByDay(stays: OvernightStay[]): Map<number, string> {
  const byDay = new Map<number, string>()
  for (const stay of stays) {
    const nights = Math.max(0, Math.floor(stay.nights))
    for (let offset = 0; offset < nights && stay.dayStart + offset <= MAX_TRIP_DAY; offset += 1) {
      byDay.set(stay.dayStart + offset, stay.name)
    }
  }
  return byDay
}

export function dailyRouteTitle(day: Pick<DailyTimelineDay, 'dayNumber'>, mappedCount: number, isToday: boolean): string {
  const prefix = isToday ? "Today's" : day.dayNumber != null ? `Day ${day.dayNumber}` : 'Day'
  return `${prefix} ${mappedCount === 1 ? 'locations' : 'route'}`
}

export function dailyRouteMode(mappedCount: number): 'fallback' | 'markers' | 'directions' {
  if (mappedCount <= 0) return 'fallback'
  return mappedCount === 1 ? 'markers' : 'directions'
}

export function shouldShowCurrentTime(
  lifecycle: DailyTripLifecycle,
  day: DailyTimelineDay,
  today: string,
): boolean {
  return lifecycle === 'active' && day.date === today && day.entries.some((entry) => entry.startAt !== null)
}

export function currentTimeInsertIndex(entries: DailyTimelineEntry[], now: Date): number {
  const nowMs = now.getTime()
  const firstFuture = entries.findIndex((entry) => entry.startAt !== null && Date.parse(entry.startAt) > nowMs)
  return firstFuture < 0 ? entries.length : firstFuture
}
