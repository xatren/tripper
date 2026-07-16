/*
 * Trip lifecycle phases derived from the trip's date range.
 *
 * Timezone note: trip dates are date-only ISO strings (YYYY-MM-DD) with no
 * timezone attached. The whole app interprets them in the device's local
 * timezone (see formatHeaderDate/addDays in trip-domain-utils), so "today"
 * here is the device-local calendar date. A traveller whose device timezone
 * differs from the destination's may see a phase flip up to a day early or
 * late — acceptable until stops carry timezones of their own.
 *
 * No `@/` imports: this module is exercised directly by the node test runner
 * (tests/trip-lifecycle.test.mts), which doesn't resolve path aliases.
 */

export type TripLifecycle = 'upcoming' | 'active' | 'completed' | 'undated'

export interface TripDates {
  start_date?: string | null
  end_date?: string | null
}

/** Device-local calendar date as YYYY-MM-DD. */
export function localDateISO(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whole days from `fromISO` to `toISO`; negative when `toISO` is earlier. Rounding absorbs DST offsets. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime()
  const to = new Date(`${toISO}T00:00:00`).getTime()
  return Math.round((to - from) / 86_400_000)
}

/**
 * Which phase the trip is in on `todayISO`. When only one bound exists the
 * trip is treated as a single-day window on the known date rather than
 * guessing a length. Date-only ISO strings compare correctly as strings.
 */
export function tripLifecycle(dates: TripDates, todayISO = localDateISO()): TripLifecycle {
  const start = dates.start_date ?? dates.end_date
  const end = dates.end_date ?? dates.start_date
  if (!start || !end) return 'undated'
  if (todayISO < start) return 'upcoming'
  if (todayISO > end) return 'completed'
  return 'active'
}

/** 1-based trip day that `todayISO` falls on. Only meaningful while the trip is active. */
export function currentTripDay(startISO: string, todayISO = localDateISO()): number {
  return daysBetween(startISO, todayISO) + 1
}
