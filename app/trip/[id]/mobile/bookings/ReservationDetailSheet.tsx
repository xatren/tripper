'use client'

import { useEffect, useState } from 'react'
import type { Reservation, ReservationAttachment } from '@/types'
import { CURRENCY_SYMBOLS } from '@/types'
import { MobileBottomSheet, StatusChip, tokens } from '@/components/mobile'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import { DOCUMENTS_BUCKET, formatAttachmentSize, sanitizeExternalUrl } from './bookings-logic'
import { formatReservationRange, PAYMENT_STATUS_META, RESERVATION_STATUS_META, RESERVATION_TYPE_META } from './bookings-ui'

const SIGNED_URL_TTL_SECONDS = 5 * 60

export interface ReservationDetailSheetProps {
  reservation: Reservation | null
  canEdit: boolean
  onClose: () => void
  onEdit: (reservation: Reservation) => void
  onDelete: (reservation: Reservation) => void
  /** Jump to the linked plan item; undefined hides the action. */
  onViewItinerary?: (itemId: string) => void
}

const ACTION_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '10px 14px',
  borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
  color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', textDecoration: 'none',
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      <span style={{ fontSize: 13.5, color: tokens.textPrimary, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  )
}

/**
 * Read view of one saved booking: full details, confirmation reveal, document
 * open via short-lived signed URLs (never inline-rendered), and outbound
 * actions restricted to sanitized https/http URLs.
 */
export function ReservationDetailSheet({ reservation, canEdit, onClose, onEdit, onDelete, onViewItinerary }: ReservationDetailSheetProps) {
  const [confirmationRevealed, setConfirmationRevealed] = useState(false)
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null)

  useEffect(() => {
    setConfirmationRevealed(false)
    setOpeningAttachmentId(null)
  }, [reservation?.id])

  if (!reservation) return <MobileBottomSheet open={false} onClose={onClose} title="Booking">{null}</MobileBottomSheet>

  const typeMeta = RESERVATION_TYPE_META[reservation.reservation_type]
  const statusMeta = RESERVATION_STATUS_META[reservation.status]
  const paymentMeta = PAYMENT_STATUS_META[reservation.payment_status]
  const dateRange = formatReservationRange(reservation.start_at, reservation.end_at, reservation.timezone)
  const providerUrl = sanitizeExternalUrl(reservation.booking_url)
  const attachments = reservation.reservation_attachments ?? []

  const directionsUrl = reservation.lat !== null && reservation.lng !== null
    ? `https://www.google.com/maps/dir/?api=1&destination=${reservation.lat},${reservation.lng}`
    : reservation.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(reservation.address)}`
      : null

  /**
   * Signed URLs are minted per tap with a 5-minute TTL and never cached in
   * state, so a stale link can't outlive the sheet. Documents open in a new
   * tab (browser viewer / download) — nothing is inline-rendered.
   */
  const openAttachment = async (attachment: ReservationAttachment) => {
    if (openingAttachmentId) return
    setOpeningAttachmentId(attachment.id)
    try {
      const { data, error } = await createClient().storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS)
      if (error || !data?.signedUrl) {
        showToast("Couldn't authorize the document. Try again.", 'error')
        return
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setOpeningAttachmentId(null)
    }
  }

  return (
    <MobileBottomSheet open onClose={onClose} title={reservation.title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip tone="accent" icon={typeMeta.icon}>{typeMeta.label}</StatusChip>
          <StatusChip tone={statusMeta.tone}>{statusMeta.label}</StatusChip>
          <StatusChip tone={paymentMeta.tone}>{paymentMeta.label}</StatusChip>
        </div>

        {/* Solid info section inside the elevated sheet frame. */}
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', borderRadius: tokens.radius16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reservation.provider && <DetailRow label="Provider">{reservation.provider}</DetailRow>}
          {dateRange && <DetailRow label="When">{dateRange}</DetailRow>}
          {reservation.address && <DetailRow label="Where">{reservation.address}</DetailRow>}
          {reservation.amount !== null && (
            <DetailRow label="Amount">
              {reservation.currency ? CURRENCY_SYMBOLS[reservation.currency] : ''}{reservation.amount}
            </DetailRow>
          )}
          {reservation.confirmation_number && (
            <DetailRow label="Confirmation number">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em' }}>
                  {confirmationRevealed ? reservation.confirmation_number : '••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmationRevealed((value) => !value)}
                  style={{ background: 'none', border: 'none', color: tokens.accentLight, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0', minHeight: 32 }}
                >
                  {confirmationRevealed ? 'Hide' : 'Reveal'}
                </button>
              </span>
            </DetailRow>
          )}
          {reservation.notes && <DetailRow label="Notes">{reservation.notes}</DetailRow>}
        </div>

        {attachments.length > 0 && (
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Documents</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => { void openAttachment(attachment) }}
                  disabled={openingAttachmentId !== null}
                  style={{ ...ACTION_STYLE, justifyContent: 'flex-start', opacity: openingAttachmentId && openingAttachmentId !== attachment.id ? 0.6 : 1 }}
                >
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                  </svg>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.original_name}</span>
                  <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 11.5, fontWeight: 600, color: tokens.textMuted }}>
                    {openingAttachmentId === attachment.id ? 'Opening…' : formatAttachmentSize(attachment.size_bytes)}
                  </span>
                </button>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: tokens.textMuted, lineHeight: 1.5 }}>
              Documents open in a new tab with a link that expires after a few minutes.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {directionsUrl && (
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={ACTION_STYLE}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              Directions
            </a>
          )}
          {providerUrl && (
            <a href={providerUrl} target="_blank" rel="noopener noreferrer" style={ACTION_STYLE}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
              Open provider site
            </a>
          )}
          {reservation.itinerary_item_id && onViewItinerary && (
            <button type="button" onClick={() => onViewItinerary(reservation.itinerary_item_id!)} style={ACTION_STYLE}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              View on itinerary
            </button>
          )}
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => onEdit(reservation)}
              style={{
                flex: 1, minHeight: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, fontSize: 14, fontFamily: 'inherit',
              }}
            >
              Edit booking
            </button>
            <button
              type="button"
              onClick={() => onDelete(reservation)}
              style={{
                minHeight: 48, padding: '0 18px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', color: tokens.danger, fontWeight: 800, fontSize: 14,
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  )
}
