import type { TripLifecycle } from './trip-lifecycle'

interface OrderedStop {
  id: string
  order_index: number
}

interface ScheduledStop {
  arrival: string | null
  departure: string | null
}

export interface HeroCopy {
  badge: string
  message: string
}

export type ProgressState =
  | { status: 'ready'; value: number; label: string }
  | { status: 'empty'; label: 'Not started' }
  | { status: 'error'; label: 'Progress unavailable' }

function formatShortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Re-exported so existing Overview call sites and tests keep one import path. */
export { safeCoverImageUrl } from '../../../../lib/media-url.ts'

export function orderStops<T extends OrderedStop>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id))
}

export function stopDateLabel(schedule: ScheduledStop | undefined): string {
  if (!schedule) return 'Dates not set'
  if (schedule.arrival && schedule.departure) {
    return `${formatShortDate(schedule.arrival)} – ${formatShortDate(schedule.departure)}`
  }
  if (schedule.arrival) return `Arrive ${formatShortDate(schedule.arrival)}`
  if (schedule.departure) return `Leave ${formatShortDate(schedule.departure)}`
  return 'Dates not set'
}

export function tripScopeLabel(members: Array<{ user_id: string }>): string | null {
  const count = new Set(members.map((member) => member.user_id)).size
  if (count === 0) return null
  if (count === 1) return 'Personal trip'
  return `${count} travelers`
}

export function routeContextLabel(stops: Array<{ name: string }>): string | null {
  const names = stops
    .map((stop) => stop.name.trim())
    .filter((name, index, all) => name.length > 0 && all.indexOf(name) === index)
  if (names.length === 0) return null
  if (names.length <= 3) return names.join(' → ')
  return `${names[0]} → ${names.at(-1)}`
}

export function heroCopy(
  lifecycle: TripLifecycle,
  options: { daysUntilStart?: number; dayNumber?: number; totalDays?: number; currentStopName?: string | null },
): HeroCopy {
  if (lifecycle === 'undated') {
    return { badge: 'DATES NOT SET', message: 'Add dates to unlock your trip timeline' }
  }
  if (lifecycle === 'upcoming') {
    const days = Math.max(0, options.daysUntilStart ?? 0)
    return {
      badge: 'UPCOMING',
      message: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days away`,
    }
  }
  if (lifecycle === 'active') {
    const dayNumber = Math.max(1, options.dayNumber ?? 1)
    const totalDays = Math.max(dayNumber, options.totalDays ?? dayNumber)
    return {
      badge: `DAY ${dayNumber} OF ${totalDays}`,
      message: options.currentStopName ? `Today in ${options.currentStopName}` : 'Continue your journey',
    }
  }
  return { badge: 'COMPLETED', message: 'View trip recap' }
}

export function preparationProgress(status: 'ready' | 'error', total: number, checked: number): ProgressState {
  if (status === 'error') return { status: 'error', label: 'Progress unavailable' }
  if (total <= 0) return { status: 'empty', label: 'Not started' }
  const value = Math.max(0, Math.min(100, Math.round((checked / total) * 100)))
  return { status: 'ready', value, label: `${value}% done` }
}

export function travelModeIsAccented(lifecycle: TripLifecycle): boolean {
  return lifecycle === 'active'
}

export function photosActionLabel(lifecycle: TripLifecycle): 'Photos' | 'Trip Recap' {
  return lifecycle === 'completed' ? 'Trip Recap' : 'Photos'
}

/** Split the display title at its last word or camel-case boundary for the Dusk amber flourish. */
export function splitDuskTitle(title: string): { lead: string; accent: string } {
  const trimmed = title.trim()
  if (!trimmed) return { lead: '', accent: '' }
  const wordBoundary = trimmed.lastIndexOf(' ')
  if (wordBoundary > 0) return { lead: trimmed.slice(0, wordBoundary + 1), accent: trimmed.slice(wordBoundary + 1) }
  const camelBoundaries = [...trimmed.matchAll(/(?<=[a-z0-9])(?=[A-Z])/g)]
  const camelBoundary = camelBoundaries.at(-1)?.index
  if (camelBoundary && camelBoundary > 0) return { lead: trimmed.slice(0, camelBoundary), accent: trimmed.slice(camelBoundary) }
  return { lead: trimmed, accent: '' }
}
