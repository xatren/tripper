import type { ItineraryItemType, Reservation, ReservationType } from '@/types'

/**
 * Pure decision logic for the Bookings center — file validation, storage path
 * generation, list grouping/filtering, itinerary mapping, and external-URL
 * safety. No Supabase or React imports so `tests/bookings-logic.test.mts`
 * can exercise every branch under `node --test`.
 */

export const DOCUMENTS_BUCKET = 'trip-documents'

/** Server contract twins: bucket allowlist + size limit in the migration. */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
export const ATTACHMENT_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_MIME_TO_EXT).join(',')

export interface AttachmentValidationError {
  code: 'unsupported-type' | 'too-large' | 'empty'
  message: string
}

/**
 * Client-side pre-upload validation. The bucket enforces the same limits
 * server-side; this exists so failures surface before bytes leave the device.
 */
export function validateAttachmentFile(file: { type: string; size: number; name: string }): AttachmentValidationError | null {
  if (!ATTACHMENT_MIME_TO_EXT[file.type]) {
    return { code: 'unsupported-type', message: 'Only PDF, JPEG, PNG, and WebP files are supported.' }
  }
  if (file.size <= 0) {
    return { code: 'empty', message: 'This file is empty.' }
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { code: 'too-large', message: 'Files can be at most 20 MB.' }
  }
  return null
}

/**
 * Object path inside `trip-documents`. Built exclusively from ids and a fresh
 * uuid — the user's filename never becomes a path segment.
 */
export function buildAttachmentPath(tripId: string, reservationId: string, uuid: string, mimeType: string): string {
  const ext = ATTACHMENT_MIME_TO_EXT[mimeType]
  if (!ext) throw new Error(`Unsupported attachment MIME type: ${mimeType}`)
  return `${tripId}/reservations/${reservationId}/${uuid}.${ext}`
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Only plain web URLs may leave the app (no javascript:, data:, deep links).
 * Returns the normalized URL string, or null when the value must not be used.
 */
export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  return parsed.toString()
}

/** Confirmation codes stay masked on cards; the detail sheet can reveal them. */
export function maskConfirmationNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.length <= 3) return '•'.repeat(trimmed.length)
  return `${'•'.repeat(Math.min(6, trimmed.length - 3))}${trimmed.slice(-3)}`
}

/** The reservation's anchor instant for sorting and upcoming/previous splits. */
export function reservationSortInstant(reservation: Pick<Reservation, 'start_at' | 'end_at' | 'created_at'>): number {
  const anchor = reservation.start_at ?? reservation.end_at
  return anchor ? Date.parse(anchor) : Date.parse(reservation.created_at)
}

/**
 * Upcoming = still relevant (no dates yet, ongoing, or in the future) —
 * soonest first. Previous = already over or cancelled — most recent first.
 */
export function splitReservations(reservations: Reservation[], nowMs: number): { upcoming: Reservation[]; previous: Reservation[] } {
  const upcoming: Reservation[] = []
  const previous: Reservation[] = []
  for (const reservation of reservations) {
    const endMs = reservation.end_at ? Date.parse(reservation.end_at) : (reservation.start_at ? Date.parse(reservation.start_at) : null)
    const isOver = endMs !== null && endMs < nowMs
    if (isOver || reservation.status === 'cancelled' || reservation.status === 'completed') previous.push(reservation)
    else upcoming.push(reservation)
  }
  upcoming.sort((a, b) => reservationSortInstant(a) - reservationSortInstant(b))
  previous.sort((a, b) => reservationSortInstant(b) - reservationSortInstant(a))
  return { upcoming, previous }
}

/** Type chips + free-text search over title/provider/confirmation/address. */
export function filterReservations(
  reservations: Reservation[],
  typeFilter: ReservationType | 'all',
  search: string,
): Reservation[] {
  const query = search.trim().toLowerCase()
  return reservations.filter((reservation) => {
    if (typeFilter !== 'all' && reservation.reservation_type !== typeFilter) return false
    if (!query) return true
    return [reservation.title, reservation.provider, reservation.confirmation_number, reservation.address]
      .some((field) => field?.toLowerCase().includes(query))
  })
}

/** Reservation categories → the itinerary item type a linked plan entry gets. */
export function itineraryTypeForReservation(type: ReservationType): ItineraryItemType {
  switch (type) {
    case 'flight': return 'flight'
    case 'stay': return 'stay'
    case 'restaurant': return 'restaurant'
    case 'activity': return 'activity'
    case 'car_rental':
    case 'train':
    case 'ferry':
      return 'transport'
    case 'pass':
    case 'other':
      return 'reservation'
  }
}

/**
 * Wall-clock day of an instant in the reservation's zone (device zone when the
 * zone is absent/invalid) — drives which itinerary day a linked item lands on.
 */
export function reservationLocalDate(instantISO: string, timeZone?: string | null): string {
  const date = new Date(instantISO)
  const formatterOptions = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { ...formatterOptions, timeZone: timeZone ?? undefined })
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', formatterOptions)
  }
  return formatter.format(date)
}

export interface LinkDecision {
  action: 'already-linked' | 'link-existing' | 'create-item'
  /** Present for `already-linked` / `link-existing`. */
  itemId?: string
}

/**
 * Duplicate-safe itinerary linking: a reservation that already points at a
 * live item never creates a second one; picking an existing item links it;
 * otherwise a new item is created.
 */
export function decideItineraryLink(
  reservation: Pick<Reservation, 'itinerary_item_id'>,
  existingItemIds: ReadonlySet<string>,
  selectedItemId: string | null,
): LinkDecision {
  if (reservation.itinerary_item_id && existingItemIds.has(reservation.itinerary_item_id)) {
    return { action: 'already-linked', itemId: reservation.itinerary_item_id }
  }
  if (selectedItemId && existingItemIds.has(selectedItemId)) {
    return { action: 'link-existing', itemId: selectedItemId }
  }
  return { action: 'create-item' }
}
