'use client'

import type { ReactNode } from 'react'
import type { ItineraryItemStatus, ItineraryItemType } from '@/types'
import type { StatusTone } from '@/components/mobile'

/** Shared per-type presentation (icons match the TripAddSheet stroke style). */

function strokeIcon(paths: ReactNode, size = 16) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  )
}

export const ITEM_TYPE_META: Record<ItineraryItemType, { label: string; icon: ReactNode }> = {
  place: {
    label: 'Place',
    icon: strokeIcon(<><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>),
  },
  activity: {
    label: 'Activity',
    icon: strokeIcon(<path d="M12 2L13.9 8.1L20 10L13.9 11.9L12 18L10.1 11.9L4 10L10.1 8.1L12 2Z" />),
  },
  stay: {
    label: 'Stay',
    icon: strokeIcon(<><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-8h6v8" /></>),
  },
  flight: {
    label: 'Flight',
    icon: strokeIcon(<path d="M10.5 13.5L3 11l1.5-1.5L10 10l4.5-4.5a1.6 1.6 0 0 1 2.3 2.3L12.3 12.3l.5 5.5L11.3 19l-2.5-6.5" />),
  },
  transport: {
    label: 'Transport',
    icon: strokeIcon(<><path d="M3 12l2-6a2 2 0 0 1 2-1.4h10a2 2 0 0 1 2 1.4l2 6" /><rect x="2" y="12" width="20" height="6" rx="2" /><circle cx="7" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>),
  },
  restaurant: {
    label: 'Restaurant',
    icon: strokeIcon(<><path d="M7 3v8M4.5 3v4a2.5 2.5 0 0 0 5 0V3" /><path d="M7 11v10" /><path d="M17 3c-2 1.5-3 4-3 6.5 0 1.5 1 2.5 3 2.5v9" /></>),
  },
  reservation: {
    label: 'Reservation',
    icon: strokeIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v14" strokeDasharray="2 2" /></>),
  },
  note: {
    label: 'Note',
    icon: strokeIcon(<><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h6" /></>),
  },
  free_time: {
    label: 'Free time',
    icon: strokeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>),
  },
}

export const STATUS_META: Record<ItineraryItemStatus, { label: string; tone: StatusTone }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  on_the_way: { label: 'On the way', tone: 'info' },
  arrived: { label: 'Arrived', tone: 'accent' },
  completed: { label: 'Completed', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'neutral' },
}

/** Booking-flavored types get a "Booked" indicator when their status advances. */
export const BOOKING_TYPES: ReadonlySet<ItineraryItemType> = new Set(['flight', 'stay', 'reservation'])

/** Wall-clock time of an instant in the item's zone (device zone when absent/invalid). */
export function formatWallTime(instantISO: string, timeZone?: string | null): string {
  const date = new Date(instantISO)
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone ?? undefined }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
  }
}

/** Compact duration between two instants, e.g. "2h 15m" or "45m". */
export function formatDuration(startISO: string, endISO: string): string | null {
  const minutes = Math.round((Date.parse(endISO) - Date.parse(startISO)) / 60_000)
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** Local datetime-input value (YYYY-MM-DDTHH:mm) for a stored instant, in the device zone. */
export function toDatetimeLocalValue(instantISO: string | null): string {
  if (!instantISO) return ''
  const date = new Date(instantISO)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Straight-line distance in meters between two coordinates (haversine). */
export function straightLineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
