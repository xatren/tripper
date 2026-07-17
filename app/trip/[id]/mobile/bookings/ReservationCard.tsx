'use client'

import type { Reservation } from '@/types'
import { StatusChip, tokens } from '@/components/mobile'
import { CURRENCY_SYMBOLS } from '@/types'
import { maskConfirmationNumber } from './bookings-logic'
import { formatReservationRange, PAYMENT_STATUS_META, RESERVATION_STATUS_META, RESERVATION_TYPE_META } from './bookings-ui'

export interface ReservationCardProps {
  reservation: Reservation
  onOpen: (reservation: Reservation) => void
}

/**
 * One saved booking in the list. Solid-raised surface (dense content), 44px
 * touch target. The confirmation number stays masked here — the detail sheet
 * is the place to reveal it.
 */
export function ReservationCard({ reservation, onOpen }: ReservationCardProps) {
  const typeMeta = RESERVATION_TYPE_META[reservation.reservation_type]
  const statusMeta = RESERVATION_STATUS_META[reservation.status]
  const paymentMeta = PAYMENT_STATUS_META[reservation.payment_status]
  const dateRange = formatReservationRange(reservation.start_at, reservation.end_at, reservation.timezone)
  const maskedConfirmation = maskConfirmationNumber(reservation.confirmation_number)
  const attachmentCount = reservation.reservation_attachments?.length ?? 0

  return (
    <button
      type="button"
      onClick={() => onOpen(reservation)}
      aria-label={`${typeMeta.label}: ${reservation.title}`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: tokens.surfaceRaised, border: '1px solid rgba(255,255,255,.08)',
        borderRadius: tokens.radius16, padding: 14, boxShadow: '0 6px 20px rgba(0,0,0,.2)',
        display: 'flex', flexDirection: 'column', gap: 8, minHeight: 44,
        opacity: reservation.status === 'cancelled' ? 0.65 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: tokens.radius12, flex: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(245,166,35,.13)', border: '1px solid rgba(245,166,35,.28)',
            color: tokens.accentLight,
          }}
        >
          {typeMeta.icon}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {reservation.title}
          </div>
          <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2, fontWeight: 500 }}>
            {typeMeta.label}
            {reservation.provider ? ` · ${reservation.provider}` : ''}
          </div>
        </div>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5, flex: 'none', marginTop: 4 }}>
          <path d="M6 3L11 8L6 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {(dateRange || maskedConfirmation) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {dateRange && (
            <div style={{ fontSize: 12.5, color: tokens.textSecondary, fontWeight: 500 }}>{dateRange}</div>
          )}
          {maskedConfirmation && (
            <div style={{ fontSize: 12, color: tokens.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              Confirmation {maskedConfirmation}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <StatusChip tone={statusMeta.tone}>{statusMeta.label}</StatusChip>
        <StatusChip tone={paymentMeta.tone}>
          {paymentMeta.label}
          {reservation.amount !== null && reservation.currency
            ? ` · ${CURRENCY_SYMBOLS[reservation.currency]}${reservation.amount}`
            : ''}
        </StatusChip>
        {attachmentCount > 0 && (
          <StatusChip
            tone="neutral"
            icon={
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            }
          >
            {attachmentCount} {attachmentCount === 1 ? 'document' : 'documents'}
          </StatusChip>
        )}
        {reservation.itinerary_item_id && <StatusChip tone="accent">On itinerary</StatusChip>}
      </div>
    </button>
  )
}
