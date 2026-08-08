export type FeaturedTripStatus = 'active' | 'upcoming' | 'undated' | 'completed'

export interface FeaturedTripCandidate {
  id: string
  start_date?: string | null
  end_date?: string | null
  updated_at: string
}

/** Device-local date, formatted without parsing a date-only value through UTC. */
export function localCalendarISO(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function mapHomeTripStatus(
  trip: Pick<FeaturedTripCandidate, 'start_date' | 'end_date'>,
  todayISO = localCalendarISO(),
): FeaturedTripStatus {
  const start = trip.start_date ?? trip.end_date
  const end = trip.end_date ?? trip.start_date
  if (!start || !end) return 'undated'
  if (todayISO < start) return 'upcoming'
  if (todayISO > end) return 'completed'
  return 'active'
}

function newestFirst(a: FeaturedTripCandidate, b: FeaturedTripCandidate): number {
  return b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)
}

/**
 * Selects the single trip that deserves the Map Home viewport. All comparison
 * is performed on YYYY-MM-DD strings, so local timezone parsing cannot shift a
 * trip across a calendar-day boundary.
 */
export function selectFeaturedTrip<T extends FeaturedTripCandidate>(
  trips: readonly T[],
  todayISO = localCalendarISO(),
): T | null {
  if (trips.length === 0) return null

  const active = trips
    .filter((trip) => mapHomeTripStatus(trip, todayISO) === 'active')
    .sort((a, b) => {
      const aStart = a.start_date ?? a.end_date ?? ''
      const bStart = b.start_date ?? b.end_date ?? ''
      return bStart.localeCompare(aStart) || newestFirst(a, b)
    })
  if (active[0]) return active[0]

  const upcoming = trips
    .filter((trip) => mapHomeTripStatus(trip, todayISO) === 'upcoming')
    .sort((a, b) => {
      const aStart = a.start_date ?? a.end_date ?? '9999-12-31'
      const bStart = b.start_date ?? b.end_date ?? '9999-12-31'
      return aStart.localeCompare(bStart) || newestFirst(a, b)
    })
  if (upcoming[0]) return upcoming[0]

  const undated = trips
    .filter((trip) => mapHomeTripStatus(trip, todayISO) === 'undated')
    .sort(newestFirst)
  if (undated[0]) return undated[0]

  return trips
    .filter((trip) => mapHomeTripStatus(trip, todayISO) === 'completed')
    .sort((a, b) => {
      const aEnd = a.end_date ?? a.start_date ?? ''
      const bEnd = b.end_date ?? b.start_date ?? ''
      return bEnd.localeCompare(aEnd) || newestFirst(a, b)
    })[0] ?? null
}

