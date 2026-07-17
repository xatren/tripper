import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ATTACHMENT_MAX_BYTES,
  buildAttachmentPath,
  decideItineraryLink,
  filterReservations,
  formatAttachmentSize,
  itineraryTypeForReservation,
  maskConfirmationNumber,
  reservationLocalDate,
  sanitizeExternalUrl,
  splitReservations,
  validateAttachmentFile,
} from '../app/trip/[id]/mobile/bookings/bookings-logic.ts'
import type { Reservation, ReservationType } from '../types/index.ts'

function reservation(overrides: Partial<Reservation> & { id: string }): Reservation {
  return {
    trip_id: 'trip-1',
    itinerary_item_id: null,
    reservation_type: 'stay',
    provider: null,
    title: 'Sample Booking',
    confirmation_number: null,
    start_at: null,
    end_at: null,
    timezone: null,
    address: null,
    lat: null,
    lng: null,
    amount: null,
    currency: null,
    payment_status: 'unpaid',
    status: 'confirmed',
    booking_url: null,
    notes: null,
    created_by: 'user-1',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

// ── File validation ───────────────────────────────────────────────────────────

test('validateAttachmentFile accepts every allowlisted MIME type within the size limit', () => {
  for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validateAttachmentFile({ type, size: 1024, name: 'doc' }), null)
  }
})

test('validateAttachmentFile rejects unsupported types, oversize, and empty files', () => {
  assert.equal(validateAttachmentFile({ type: 'image/gif', size: 10, name: 'a.gif' })?.code, 'unsupported-type')
  assert.equal(validateAttachmentFile({ type: 'application/zip', size: 10, name: 'a.zip' })?.code, 'unsupported-type')
  assert.equal(validateAttachmentFile({ type: 'application/pdf', size: ATTACHMENT_MAX_BYTES + 1, name: 'big.pdf' })?.code, 'too-large')
  assert.equal(validateAttachmentFile({ type: 'application/pdf', size: 0, name: 'empty.pdf' })?.code, 'empty')
})

test('validateAttachmentFile accepts a file exactly at the size limit', () => {
  assert.equal(validateAttachmentFile({ type: 'application/pdf', size: ATTACHMENT_MAX_BYTES, name: 'max.pdf' }), null)
})

// ── Path generation ──────────────────────────────────────────────────────────

test('buildAttachmentPath derives the path from ids and MIME, never the filename', () => {
  const path = buildAttachmentPath('trip-1', 'res-9', 'uuid-4', 'application/pdf')
  assert.equal(path, 'trip-1/reservations/res-9/uuid-4.pdf')
  assert.equal(buildAttachmentPath('t', 'r', 'u', 'image/jpeg'), 't/reservations/r/u.jpg')
  assert.equal(buildAttachmentPath('t', 'r', 'u', 'image/webp'), 't/reservations/r/u.webp')
})

test('buildAttachmentPath throws for MIME types outside the allowlist', () => {
  assert.throws(() => buildAttachmentPath('t', 'r', 'u', 'application/zip'))
})

test('formatAttachmentSize renders human-readable sizes', () => {
  assert.equal(formatAttachmentSize(512), '512 B')
  assert.equal(formatAttachmentSize(2048), '2 KB')
  assert.equal(formatAttachmentSize(3 * 1024 * 1024), '3.0 MB')
})

// ── External URL safety ──────────────────────────────────────────────────────

test('sanitizeExternalUrl allows only http(s) URLs', () => {
  assert.equal(sanitizeExternalUrl('https://booking.com/x?a=1'), 'https://booking.com/x?a=1')
  assert.equal(sanitizeExternalUrl('http://example.com'), 'http://example.com/')
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null)
  assert.equal(sanitizeExternalUrl('data:text/html,<b>x</b>'), null)
  assert.equal(sanitizeExternalUrl('ftp://example.com/file'), null)
  assert.equal(sanitizeExternalUrl('not a url'), null)
  assert.equal(sanitizeExternalUrl(''), null)
  assert.equal(sanitizeExternalUrl(null), null)
})

// ── Confirmation masking ─────────────────────────────────────────────────────

test('maskConfirmationNumber keeps only the last three characters readable', () => {
  assert.equal(maskConfirmationNumber('ABC123XYZ'), '••••••XYZ')
  assert.equal(maskConfirmationNumber('AB12'), '•B12')
  assert.equal(maskConfirmationNumber('AB'), '••')
  assert.equal(maskConfirmationNumber(''), null)
  assert.equal(maskConfirmationNumber(null), null)
})

// ── Upcoming / previous split ────────────────────────────────────────────────

test('splitReservations groups by end instant and status, with stable ordering', () => {
  const now = Date.parse('2026-07-16T12:00:00Z')
  const past = reservation({ id: 'past', start_at: '2026-07-01T10:00:00Z', end_at: '2026-07-02T10:00:00Z' })
  const ongoing = reservation({ id: 'ongoing', start_at: '2026-07-16T00:00:00Z', end_at: '2026-07-18T00:00:00Z' })
  const future = reservation({ id: 'future', start_at: '2026-08-01T10:00:00Z' })
  const cancelled = reservation({ id: 'cancelled', start_at: '2026-09-01T10:00:00Z', status: 'cancelled' })
  const undated = reservation({ id: 'undated' })

  const { upcoming, previous } = splitReservations([future, cancelled, past, ongoing, undated], now)
  assert.deepEqual(upcoming.map((entry) => entry.id), ['undated', 'ongoing', 'future'])
  assert.deepEqual(previous.map((entry) => entry.id), ['cancelled', 'past'])
})

// ── Filters ──────────────────────────────────────────────────────────────────

test('filterReservations combines the type chip with free-text search', () => {
  const rows = [
    reservation({ id: 'a', reservation_type: 'flight', title: 'Flight to Rome', provider: 'Turkish Airlines' }),
    reservation({ id: 'b', reservation_type: 'stay', title: 'Hotel Roma', confirmation_number: 'XK42P' }),
    reservation({ id: 'c', reservation_type: 'stay', title: 'Beach House', address: 'Amalfi Coast' }),
  ]
  assert.deepEqual(filterReservations(rows, 'stay', '').map((entry) => entry.id), ['b', 'c'])
  assert.deepEqual(filterReservations(rows, 'all', 'roma').map((entry) => entry.id), ['b'])
  assert.deepEqual(filterReservations(rows, 'all', 'xk42').map((entry) => entry.id), ['b'])
  assert.deepEqual(filterReservations(rows, 'all', 'amalfi').map((entry) => entry.id), ['c'])
  assert.deepEqual(filterReservations(rows, 'stay', 'turkish').map((entry) => entry.id), [])
})

// ── Itinerary mapping and linking ────────────────────────────────────────────

test('itineraryTypeForReservation maps every category to a valid itinerary type', () => {
  const expectations: Record<ReservationType, string> = {
    flight: 'flight', stay: 'stay', restaurant: 'restaurant', activity: 'activity',
    car_rental: 'transport', train: 'transport', ferry: 'transport',
    pass: 'reservation', other: 'reservation',
  }
  for (const [type, expected] of Object.entries(expectations)) {
    assert.equal(itineraryTypeForReservation(type as ReservationType), expected)
  }
})

test('reservationLocalDate resolves the wall-clock day in the stored zone', () => {
  // 23:30 UTC on the 1st is already the 2nd in Istanbul (UTC+3).
  assert.equal(reservationLocalDate('2026-08-01T23:30:00Z', 'Europe/Istanbul'), '2026-08-02')
  assert.equal(reservationLocalDate('2026-08-01T12:00:00Z', 'Europe/Istanbul'), '2026-08-01')
  // Invalid zones fall back to the device zone without throwing.
  assert.equal(typeof reservationLocalDate('2026-08-01T12:00:00Z', 'Not/AZone'), 'string')
})

test('decideItineraryLink never duplicates an existing live link', () => {
  const existing = new Set(['item-1', 'item-2'])
  assert.deepEqual(
    decideItineraryLink({ itinerary_item_id: 'item-1' }, existing, null),
    { action: 'already-linked', itemId: 'item-1' },
  )
  // A selection is honored when the reservation has no live link.
  assert.deepEqual(
    decideItineraryLink({ itinerary_item_id: null }, existing, 'item-2'),
    { action: 'link-existing', itemId: 'item-2' },
  )
  // A dangling pointer (item deleted, FK SET NULL pending refresh) creates fresh.
  assert.deepEqual(
    decideItineraryLink({ itinerary_item_id: 'gone' }, existing, null),
    { action: 'create-item' },
  )
  assert.deepEqual(
    decideItineraryLink({ itinerary_item_id: null }, existing, null),
    { action: 'create-item' },
  )
})
