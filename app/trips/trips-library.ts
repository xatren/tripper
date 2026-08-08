/* Screen 04 — Trips Library.
   Pure presentation logic for the /trips archive. No react/next imports and no
   `@/` alias, so this module stays runnable under `node --experimental-strip-types`.
   Status is never recomputed here: `mapHomeTripStatus` in lib/map-home.ts is the
   single source of truth, and every comparison happens on YYYY-MM-DD strings so a
   local timezone cannot shift a trip across a calendar-day boundary.

   Note: app/trip/[id]/mobile/trip-lifecycle.ts still holds a third copy of this
   vocabulary. Merging it is deliberately out of scope for this screen. */

import { localCalendarISO, mapHomeTripStatus, type FeaturedTripStatus } from '../../lib/map-home.ts'
import { safeCoverImageUrl } from '../../lib/media-url.ts'
export {
  selectNearbyTripPhoto,
  selectIconicLandmarkPhoto,
  selectTripCoverPhoto,
  selectTripPhotoStop,
  tripLandmarkSearchParams,
  tripPhotoSearchParams,
  type TripAutoPhoto,
  type TripPhotoCandidate,
} from '../../lib/trip-photo.ts'

export type TripLibraryStatus = FeaturedTripStatus
export type TripFilter = 'all' | 'planned' | 'active' | 'completed'
export type StatusTone = 'live' | 'soon' | 'past' | 'neutral'

export interface LibraryCountry {
  name: string
  flag: string
}

export interface LibraryTrip {
  id: string
  title: string
  start_date?: string | null
  end_date?: string | null
  updated_at: string
  cover_image_url?: string
  vibe?: string | null
  countries?: LibraryCountry[] | null
}

export interface LibraryStop {
  id: string
  trip_id: string
  lat: number
  lng: number
  name?: string
  address?: string | null
  order_index?: number
  stop_type?: string
}

export interface StatusBadge {
  text: string
  tone: StatusTone
}

export interface LibraryHeadline {
  value: string
  label: string
  hint: string
  hintTripId: string | null
}

export interface EmptyStateCopy {
  title: string
  body: string
  cta: string | null
  action: 'clear' | 'new' | 'create' | null
}

export type TripThumbnail =
  | { kind: 'image'; url: string }
  | { kind: 'seed'; gradient: string; initials: string }

export const VIBE_LABELS: Record<string, string> = {
  Road: 'Road trip',
  Fly: 'City escape',
  Camp: 'Camp',
  Beach: 'Coast',
  Mountain: 'Mountains',
  Backpack: 'Backpacking',
}

export const TRIP_FILTERS: { id: TripFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'planned', label: 'Planned' },
  { id: 'active', label: 'On the road' },
  { id: 'completed', label: 'Past' },
]

/* ── Dates ──────────────────────────────────────────────────────────── */

/** Parses a date-only value at UTC midnight purely to subtract two of them. */
function isoDayMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

function daysBetweenISO(fromISO: string, toISO: string): number {
  return Math.round((isoDayMs(toISO) - isoDayMs(fromISO)) / 86_400_000)
}

/**
 * Formats a date-only value in the device's own calendar. `lib/utils.ts`'s
 * formatDate is deliberately not used: `new Date("2026-08-12")` parses as UTC
 * and renders a day early west of Greenwich.
 */
function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonthYear(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** The window a trip actually occupies; a single-sided date is a one-day window. */
function tripWindow(trip: Pick<LibraryTrip, 'start_date' | 'end_date'>): { start: string; end: string } | null {
  const start = trip.start_date ?? trip.end_date
  const end = trip.end_date ?? trip.start_date
  return start && end ? { start, end } : null
}

/* ── Status ─────────────────────────────────────────────────────────── */

export function tripLibraryStatus(
  trip: Pick<LibraryTrip, 'start_date' | 'end_date'>,
  todayISO = localCalendarISO(),
): TripLibraryStatus {
  return mapHomeTripStatus(trip, todayISO)
}

/** Countdown copy for a trip that has not started yet. */
export function upcomingBadgeText(startISO: string, todayISO = localCalendarISO()): string {
  const days = daysBetweenISO(todayISO, startISO)
  if (days <= 0) return 'Starts today'
  if (days === 1) return 'Starts tomorrow'
  if (days <= 60) return `In ${days} days`
  return `Starts ${formatMonthYear(startISO)}`
}

export function statusBadge(trip: LibraryTrip, todayISO = localCalendarISO()): StatusBadge {
  const status = tripLibraryStatus(trip, todayISO)
  const window = tripWindow(trip)

  if (status === 'active') {
    if (window && trip.start_date && trip.end_date) {
      const total = daysBetweenISO(window.start, window.end) + 1
      const day = Math.min(total, Math.max(1, daysBetweenISO(window.start, todayISO) + 1))
      return { text: `Day ${day} of ${total}`, tone: 'live' }
    }
    return { text: 'On the road', tone: 'live' }
  }
  if (status === 'upcoming' && window) return { text: upcomingBadgeText(window.start, todayISO), tone: 'soon' }
  if (status === 'completed') return { text: 'Completed', tone: 'past' }
  return { text: 'Dates open', tone: 'neutral' }
}

/* ── Card copy ──────────────────────────────────────────────────────── */

const SUBTITLE_FALLBACK: Record<TripLibraryStatus, string> = {
  active: 'Add your first stop',
  upcoming: 'Destination not set yet',
  completed: 'No destinations logged',
  undated: 'Add dates and destinations',
}

function countryNames(trip: LibraryTrip, max = 2): string {
  return (trip.countries ?? [])
    .map((country) => country.name)
    .filter(Boolean)
    .slice(0, max)
    .join(' + ')
}

/** Countries first, then the trip vibe, then a status-specific nudge. */
export function tripSubtitle(trip: LibraryTrip, todayISO = localCalendarISO()): string {
  const countries = countryNames(trip)
  if (countries) return countries
  const vibe = trip.vibe ? VIBE_LABELS[trip.vibe] : ''
  if (vibe) return vibe
  return SUBTITLE_FALLBACK[tripLibraryStatus(trip, todayISO)]
}

export function tripFlags(trip: LibraryTrip, max = 2): string {
  return (trip.countries ?? [])
    .map((country) => country.flag)
    .filter(Boolean)
    .slice(0, max)
    .join('')
}

/** Inclusive day count; null unless both bounds are known. */
export function tripDurationLabel(trip: LibraryTrip): string | null {
  if (!trip.start_date || !trip.end_date) return null
  const days = Math.max(1, daysBetweenISO(trip.start_date, trip.end_date) + 1)
  return `${days} day${days === 1 ? '' : 's'}`
}

export function tripDateLine(trip: LibraryTrip): string {
  if (trip.start_date && trip.end_date) {
    return `${formatShortDate(trip.start_date)} – ${formatShortDate(trip.end_date)}`
  }
  const single = trip.start_date ?? trip.end_date
  return single ? formatShortDate(single) : 'Choose dates later'
}

/* ── Filtering, search and order ────────────────────────────────────── */

export function matchesFilter(status: TripLibraryStatus, filter: TripFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'planned') return status === 'upcoming' || status === 'undated'
  if (filter === 'active') return status === 'active'
  return status === 'completed'
}

export function filterCounts(
  trips: readonly LibraryTrip[],
  todayISO = localCalendarISO(),
): Record<TripFilter, number> {
  const counts: Record<TripFilter, number> = { all: trips.length, planned: 0, active: 0, completed: 0 }
  for (const trip of trips) {
    const status = tripLibraryStatus(trip, todayISO)
    if (matchesFilter(status, 'planned')) counts.planned += 1
    if (matchesFilter(status, 'active')) counts.active += 1
    if (matchesFilter(status, 'completed')) counts.completed += 1
  }
  return counts
}

export function matchesQuery(trip: LibraryTrip, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  const haystack = [
    trip.title,
    ...(trip.countries ?? []).map((country) => country.name),
    trip.vibe ? VIBE_LABELS[trip.vibe] ?? trip.vibe : '',
  ].join(' ').toLocaleLowerCase()
  return haystack.includes(normalized)
}

const STATUS_RANK: Record<TripLibraryStatus, number> = { active: 0, upcoming: 1, undated: 2, completed: 3 }

/** On the road first, then what starts soonest, then loose plans, then the archive. */
export function sortTripsForLibrary<T extends LibraryTrip>(
  trips: readonly T[],
  todayISO = localCalendarISO(),
): T[] {
  return [...trips].sort((a, b) => {
    const aStatus = tripLibraryStatus(a, todayISO)
    const bStatus = tripLibraryStatus(b, todayISO)
    const rank = STATUS_RANK[aStatus] - STATUS_RANK[bStatus]
    if (rank !== 0) return rank

    if (aStatus === 'active') {
      const order = (b.start_date ?? b.end_date ?? '').localeCompare(a.start_date ?? a.end_date ?? '')
      if (order !== 0) return order
    } else if (aStatus === 'upcoming') {
      const order = (a.start_date ?? a.end_date ?? '9999-12-31').localeCompare(b.start_date ?? b.end_date ?? '9999-12-31')
      if (order !== 0) return order
    } else if (aStatus === 'undated') {
      const order = b.updated_at.localeCompare(a.updated_at)
      if (order !== 0) return order
    } else {
      const order = (b.end_date ?? b.start_date ?? '').localeCompare(a.end_date ?? a.start_date ?? '')
      if (order !== 0) return order
    }
    return a.id.localeCompare(b.id)
  })
}

/* ── Headline ───────────────────────────────────────────────────────── */

/** One live line: how much is ahead, and a tappable shortcut into the next trip. */
export function libraryHeadline(
  trips: readonly LibraryTrip[],
  todayISO = localCalendarISO(),
): LibraryHeadline {
  const ahead = trips.filter((trip) => {
    const status = tripLibraryStatus(trip, todayISO)
    return status === 'active' || status === 'upcoming'
  })
  const label = ahead.length === 1 ? 'trip ahead' : 'trips ahead'

  if (trips.length === 0) return { value: '0', label, hint: 'Nothing planned yet', hintTripId: null }
  if (ahead.length === 0) {
    return {
      value: '0',
      label,
      hint: `${trips.length} trip${trips.length === 1 ? '' : 's'} in your archive`,
      hintTripId: null,
    }
  }

  const next = sortTripsForLibrary(ahead, todayISO)[0]
  const badge = statusBadge(next, todayISO)
  const hint = tripLibraryStatus(next, todayISO) === 'active'
    ? `${badge.text} · ${next.title}`
    : `${next.title} · ${badge.text.toLocaleLowerCase()}`

  return { value: String(ahead.length), label, hint, hintTripId: next.id }
}

/* ── Thumbnail ──────────────────────────────────────────────────────── */

const SEED_PALETTES = [
  ['#284d55', '#2f7d78'],
  ['#342b66', '#62559b'],
  ['#21445b', '#3c7188'],
  ['#493253', '#7d5064'],
]

/** Same deterministic hash as the Overview avatar fallback: one id, one colour. */
export function seededGradient(seed: string): string {
  const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const [from, to] = SEED_PALETTES[hash % SEED_PALETTES.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}

export function tripInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words.slice(0, 2).map((word) => [...word][0] ?? '').join('').toLocaleUpperCase()
}

export function tripThumbnail(trip: LibraryTrip): TripThumbnail {
  const url = safeCoverImageUrl(trip.cover_image_url)
  if (url) return { kind: 'image', url }
  return { kind: 'seed', gradient: seededGradient(trip.id), initials: tripInitials(trip.title) }
}

/* ── Empty states ───────────────────────────────────────────────────── */

export function emptyStateCopy(filter: TripFilter, query: string): EmptyStateCopy {
  if (query.trim()) {
    return {
      title: `No trips match “${query.trim()}”`,
      body: 'Try a different name or destination.',
      cta: 'Clear search',
      action: 'clear',
    }
  }
  if (filter === 'planned') {
    return { title: 'Nothing planned yet', body: 'Trips you schedule line up here.', cta: 'New trip', action: 'new' }
  }
  if (filter === 'active') {
    return {
      title: 'No trip in progress',
      body: 'A trip appears here the day it starts.',
      cta: 'New trip',
      action: 'new',
    }
  }
  if (filter === 'completed') {
    return { title: 'No finished trips yet', body: 'Your past journeys collect here.', cta: null, action: null }
  }
  return {
    title: 'Your map is ready',
    body: 'Create your first trip and watch the route come alive behind it.',
    cta: 'Create new trip',
    action: 'create',
  }
}

/* ── Decorative backdrop projection ─────────────────────────────────── */

/**
 * Projects the featured trip's own stops into the 0-100 viewBox the backdrop
 * paints. A zero span (one stop, or stops sharing a latitude) centres that axis
 * instead of dividing by zero.
 */
export function projectStopMarks(
  stops: readonly LibraryStop[],
  tripId: string | null,
): { id: string; x: number; y: number }[] {
  const validStops = tripId
    ? stops.filter((stop) => stop.trip_id === tripId && Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
    : []
  if (validStops.length === 0) return []

  const lats = validStops.map((stop) => stop.lat)
  const lngs = validStops.map((stop) => stop.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const spanLat = maxLat - minLat
  const spanLng = maxLng - minLng

  return validStops.slice(0, 6).map((stop) => ({
    id: stop.id,
    x: 16 + (spanLng === 0 ? 0.5 : (stop.lng - minLng) / spanLng) * 68,
    y: 22 + (spanLat === 0 ? 0.5 : (maxLat - stop.lat) / spanLat) * 44,
  }))
}
