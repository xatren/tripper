import type { Expense, ItineraryItem, ItineraryItemStatus, JournalEntry, Trip, TripEvent } from '@/types'

export const STATUS_TRANSITIONS: Readonly<Record<ItineraryItemStatus, readonly ItineraryItemStatus[]>> = {
  planned: ['on_the_way', 'arrived', 'completed', 'skipped'],
  on_the_way: ['arrived', 'completed', 'skipped'],
  arrived: ['completed', 'skipped'],
  completed: [],
  skipped: [],
}

export function canTransitionStatus(from: ItineraryItemStatus, to: ItineraryItemStatus): boolean {
  return from === to || STATUS_TRANSITIONS[from].includes(to)
}

export function allowedStatusTransitions(status: ItineraryItemStatus): readonly ItineraryItemStatus[] {
  return STATUS_TRANSITIONS[status]
}

export function isTripActive(trip: Pick<Trip, 'start_date' | 'end_date'>, today: string): boolean {
  if (!trip.start_date || !trip.end_date) return false
  return trip.start_date <= today && today <= trip.end_date
}

export type NavigationProvider = 'apple' | 'google' | 'waze'

export function externalNavigationUrl(provider: NavigationProvider, destination: { title: string; address?: string | null; lat?: number | null; lng?: number | null }): string | null {
  const hasCoordinates = Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
  const query = hasCoordinates ? `${destination.lat},${destination.lng}` : destination.address?.trim() || destination.title.trim()
  if (!query) return null
  if (provider === 'apple') return `https://maps.apple.com/?daddr=${encodeURIComponent(query)}&dirflg=d`
  if (provider === 'waze') return hasCoordinates
    ? `https://www.waze.com/ul?ll=${encodeURIComponent(query)}&navigate=yes`
    : `https://www.waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`
}

export type TimelineStoryItem =
  | { id: string; kind: 'plan'; occurredAt: string; item: ItineraryItem }
  | { id: string; kind: 'event'; occurredAt: string; event: TripEvent }
  | { id: string; kind: 'journal'; occurredAt: string; entry: JournalEntry }

export function mergeDayStory(input: {
  date: string
  itinerary: readonly ItineraryItem[]
  events: readonly TripEvent[]
  journal: readonly JournalEntry[]
}): TimelineStoryItem[] {
  const dayStart = `${input.date}T00:00:00`
  const plans: TimelineStoryItem[] = input.itinerary
    .filter((item) => item.local_date === input.date)
    .map((item) => ({ id: `plan:${item.id}`, kind: 'plan', occurredAt: item.start_at ?? dayStart, item }))
  const events: TimelineStoryItem[] = input.events
    .filter((event) => event.occurred_at.slice(0, 10) === input.date && !event.is_hidden)
    .map((event) => ({ id: `event:${event.id}`, kind: 'event', occurredAt: event.occurred_at, event }))
  const journal: TimelineStoryItem[] = input.journal
    .filter((entry) => entry.entry_date === input.date && !entry.is_hidden)
    .map((entry) => ({ id: `journal:${entry.id}`, kind: 'journal', occurredAt: entry.occurred_at ?? entry.created_at, entry }))
  return [...plans, ...events, ...journal].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
}

export interface RecapStats {
  planned: number
  visited: number
  skipped: number
  photos: number
  journal: number
  expenses: number
  distanceMeters: number | null
  durationSeconds: number | null
}

export function buildRecapStats(input: {
  itinerary: readonly ItineraryItem[]
  journal: readonly JournalEntry[]
  expenses: readonly Pick<Expense, 'id'>[]
  routeLegs: readonly { distanceMeters: number; durationSeconds: number }[] | null
}): RecapStats {
  const routeAvailable = input.routeLegs !== null && input.routeLegs.length > 0
  return {
    planned: input.itinerary.length,
    visited: input.itinerary.filter((item) => item.status === 'arrived' || item.status === 'completed').length,
    skipped: input.itinerary.filter((item) => item.status === 'skipped').length,
    photos: input.journal.reduce((sum, entry) => sum + (entry.journal_photos?.length ?? 0), 0),
    journal: input.journal.filter((entry) => !entry.is_hidden).length,
    expenses: input.expenses.length,
    distanceMeters: routeAvailable ? input.routeLegs!.reduce((sum, leg) => sum + leg.distanceMeters, 0) : null,
    durationSeconds: routeAvailable ? input.routeLegs!.reduce((sum, leg) => sum + leg.durationSeconds, 0) : null,
  }
}

export const RECAP_SHARE_FIELDS = ['title', 'dateRange', 'routePath', 'stops', 'distance', 'distanceUnit', 'durationHours', 'days', 'plannedCount', 'visitedCount', 'photoCount', 'journalCount', 'expenseCount', 'memoryText', 'photoUrl'] as const
export type RecapShareField = typeof RECAP_SHARE_FIELDS[number]

/** Only presentation-safe fields cross the canvas/share boundary. */
export function allowlistedRecapPayload(input: Record<string, unknown>, selected: readonly RecapShareField[]): Partial<Record<RecapShareField, unknown>> {
  const allowed = new Set<RecapShareField>(selected)
  const output: Partial<Record<RecapShareField, unknown>> = {}
  for (const key of RECAP_SHARE_FIELDS) {
    if (allowed.has(key) && input[key] !== undefined) output[key] = input[key]
  }
  return output
}
