'use client'

import type { ReactNode } from 'react'
import type { ReservationPaymentStatus, ReservationStatus, ReservationType } from '@/types'
import type { StatusTone } from '@/components/mobile'

/** Shared per-type presentation for the Bookings center (stroke-icon style). */

function strokeIcon(paths: ReactNode, size = 16) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  )
}

export const RESERVATION_TYPE_META: Record<ReservationType, { label: string; icon: ReactNode }> = {
  flight: {
    label: 'Flight',
    icon: strokeIcon(<path d="M10.5 13.5L3 11l1.5-1.5L10 10l4.5-4.5a1.6 1.6 0 0 1 2.3 2.3L12.3 12.3l.5 5.5L11.3 19l-2.5-6.5" />),
  },
  stay: {
    label: 'Stay',
    icon: strokeIcon(<><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-8h6v8" /></>),
  },
  car_rental: {
    label: 'Car rental',
    icon: strokeIcon(<><path d="M3 12l2-6a2 2 0 0 1 2-1.4h10a2 2 0 0 1 2 1.4l2 6" /><rect x="2" y="12" width="20" height="6" rx="2" /><circle cx="7" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>),
  },
  train: {
    label: 'Train',
    icon: strokeIcon(<><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M9.5 21l1.5-4M14.5 21l-1.5-4" /><circle cx="9" cy="14" r=".5" /><circle cx="15" cy="14" r=".5" /></>),
  },
  ferry: {
    label: 'Ferry',
    icon: strokeIcon(<><path d="M4 15l-1 3c3 2 6 2 9 0 3 2 6 2 9 0l-1-3" /><path d="M5 15V8h14v7" /><path d="M9 8V5h6v3M12 8v7" /></>),
  },
  restaurant: {
    label: 'Restaurant',
    icon: strokeIcon(<><path d="M7 3v8M4.5 3v4a2.5 2.5 0 0 0 5 0V3" /><path d="M7 11v10" /><path d="M17 3c-2 1.5-3 4-3 6.5 0 1.5 1 2.5 3 2.5v9" /></>),
  },
  activity: {
    label: 'Activity',
    icon: strokeIcon(<path d="M12 2L13.9 8.1L20 10L13.9 11.9L12 18L10.1 11.9L4 10L10.1 8.1L12 2Z" />),
  },
  pass: {
    label: 'Pass',
    icon: strokeIcon(<><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18M16 7V5a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v2" /></>),
  },
  other: {
    label: 'Other',
    icon: strokeIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v14" strokeDasharray="2 2" /></>),
  },
}

export const RESERVATION_STATUS_META: Record<ReservationStatus, { label: string; tone: StatusTone }> = {
  confirmed: { label: 'Confirmed', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  completed: { label: 'Completed', tone: 'neutral' },
}

export const PAYMENT_STATUS_META: Record<ReservationPaymentStatus, { label: string; tone: StatusTone }> = {
  unpaid: { label: 'Unpaid', tone: 'neutral' },
  deposit: { label: 'Deposit paid', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'warning' },
}

/** "Sat, Aug 1 · 10:00 AM" in the reservation's zone (device zone fallback). */
export function formatReservationInstant(instantISO: string, timeZone?: string | null): string {
  const date = new Date(instantISO)
  const options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone ?? undefined }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date)
  }
}

/** Compact date span for cards; single instant when end is absent. */
export function formatReservationRange(startISO: string | null, endISO: string | null, timeZone?: string | null): string | null {
  if (startISO && endISO) return `${formatReservationInstant(startISO, timeZone)} → ${formatReservationInstant(endISO, timeZone)}`
  if (startISO) return formatReservationInstant(startISO, timeZone)
  if (endISO) return `Until ${formatReservationInstant(endISO, timeZone)}`
  return null
}
