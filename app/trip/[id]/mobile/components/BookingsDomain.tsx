'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ItineraryItem, Reservation, ReservationType, Stop, Trip, TripCapabilities } from '@/types'
import { EmptyState, FilterChip, tokens } from '@/components/mobile'
import { createClient } from '@/lib/supabase/client'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { showToast } from '@/components/ui/toast'
import { RetryCard } from '../domain-ui'
import { TicketsArt } from '../empty-state-art'
import { DUSK } from '@/components/design/tokens'
import { DOCUMENTS_BUCKET, filterReservations, splitReservations } from '../bookings/bookings-logic'
import { RESERVATION_TYPE_META } from '../bookings/bookings-ui'
import { ReservationCard } from '../bookings/ReservationCard'
import { ReservationDetailSheet } from '../bookings/ReservationDetailSheet'
import { ReservationEditorSheet, draftFromReservation, emptyReservationDraft, type ReservationDraft } from '../bookings/ReservationEditorSheet'
import { FindStaySection } from '../bookings/FindStaySection'

// Session-lifetime cache so re-opening the Bookings tab never refetches.
const reservationsCache = new Map<string, Reservation[]>()

export interface BookingsDomainProps {
  trip: Trip
  stops: Stop[]
  items: ItineraryItem[]
  setItems: React.Dispatch<React.SetStateAction<ItineraryItem[]>>
  itineraryEnabled: boolean
  currentUserId: string
  capabilities: TripCapabilities
  onSelectSection: (section: 'overview' | 'plan' | 'explore' | 'bookings') => void
}

type Segment = 'bookings' | 'find-stay'

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '.06em', margin: '4px 0 2px',
}

/**
 * Top-level Bookings screen: the traveller's own reservation records with
 * documents, plus the separate "Find a stay" partner-search flow. Cards sit on
 * the opaque raised surface; the filter row is the screen's glass tier.
 */
export function BookingsDomain({ trip, stops, items, setItems, itineraryEnabled, currentUserId, capabilities, onSelectSection }: BookingsDomainProps) {
  const [segment, setSegment] = useState<Segment>('bookings')
  const [reservations, setReservationsState] = useState<Reservation[] | null>(() => reservationsCache.get(trip.id) ?? null)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [typeFilter, setTypeFilter] = useState<ReservationType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editorDraft, setEditorDraft] = useState<ReservationDraft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Reservation | null>(null)

  const setReservations = useCallback((rows: Reservation[]) => {
    reservationsCache.set(trip.id, rows)
    setReservationsState(rows)
  }, [trip.id])

  const refreshReservations = useCallback(async (surfaceError = false) => {
    const { data, error } = await createClient()
      .from('reservations')
      .select('*, reservation_attachments(*)')
      .eq('trip_id', trip.id)
      .order('start_at', { ascending: true, nullsFirst: false })
    if (!error && data) {
      setReservations(data as Reservation[])
      setLoadError(false)
    } else if (surfaceError) {
      setReservationsState([])
      setLoadError(true)
    }
  }, [setReservations, trip.id])

  useEffect(() => {
    if (reloadToken === 0 && reservationsCache.has(trip.id)) return
    let cancelled = false
    setReservationsState(null)
    setLoadError(false)
    void refreshReservations(true).then(() => {
      if (cancelled) return
    })
    return () => { cancelled = true }
  }, [refreshReservations, trip.id, reloadToken])

  // Attachments live in a child table without trip_id (like journal photos),
  // so any reservation event triggers a scoped parent refetch shortly after.
  useTripRealtimeTable<Reservation & Record<string, unknown>>(
    'reservations',
    useCallback((change) => {
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<Reservation>
      if (!row.id) return
      if (change.eventType === 'DELETE') {
        setReservationsState((previous) => {
          const next = (previous ?? []).filter((reservation) => reservation.id !== row.id)
          reservationsCache.set(trip.id, next)
          return next
        })
        setPendingDelete((pending) => (pending?.id === row.id ? null : pending))
        setDetailId((current) => (current === row.id ? null : current))
        return
      }
      void refreshReservations(false)
    }, [refreshReservations, trip.id]),
    useCallback(() => { void refreshReservations(false) }, [refreshReservations]),
  )

  const detailReservation = useMemo(
    () => (detailId ? (reservations ?? []).find((reservation) => reservation.id === detailId) ?? null : null),
    [detailId, reservations],
  )

  // The upcoming/previous boundary only needs to be right for this visit —
  // a per-mount timestamp keeps render pure.
  const [nowMs] = useState(() => Date.now())
  const filtered = useMemo(
    () => filterReservations(reservations ?? [], typeFilter, search),
    [reservations, typeFilter, search],
  )
  const { upcoming, previous } = useMemo(() => splitReservations(filtered, nowMs), [filtered, nowMs])

  const fallbackCurrency = trip.currency ?? 'USD'

  const deleteReservation = async (reservation: Reservation) => {
    setPendingDelete(null)
    const supabase = createClient()
    const paths = (reservation.reservation_attachments ?? []).map((attachment) => attachment.storage_path)
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths)
      if (storageError) {
        showToast("Couldn't remove the booking's documents, so the booking was kept. Retry is safe.", 'error')
        return
      }
    }
    const { error } = await supabase.from('reservations').delete().eq('id', reservation.id)
    if (error) {
      showToast("Documents were removed, but the booking record wasn't. Retry deletion to finish cleanup.", 'error')
      return
    }
    setDetailId(null)
    setReservations((reservationsCache.get(trip.id) ?? []).filter((entry) => entry.id !== reservation.id))
    showToast('Booking deleted.', 'success')
  }

  const canEdit = capabilities.canEdit

  return (
    <div style={{ paddingTop: 14, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Segment switch — saved records vs. external partner search. */}
      <div
        role="tablist"
        aria-label="Bookings sections"
        className="glass-standard"
        style={{ display: 'flex', gap: 4, padding: 4, borderRadius: tokens.radius16 }}
      >
        {([
          { key: 'bookings' as const, label: 'My bookings' },
          { key: 'find-stay' as const, label: 'Find a stay' },
        ]).map((option) => (
          <button
            key={option.key}
            role="tab"
            aria-selected={segment === option.key}
            onClick={() => setSegment(option.key)}
            style={{
              flex: 1, minHeight: 44, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              background: segment === option.key ? 'rgba(245,166,35,.16)' : 'none',
              border: `1px solid ${segment === option.key ? 'rgba(245,140,0,.4)' : 'transparent'}`,
              color: segment === option.key ? tokens.accentLight : tokens.textSecondary,
              fontSize: 13, fontWeight: 700,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {segment === 'find-stay' ? (
        <FindStaySection trip={trip} stops={stops} />
      ) : (
        <>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditorDraft(emptyReservationDraft(fallbackCurrency))}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48,
                borderRadius: 14, border: 'none', cursor: 'pointer',
                background: tokens.accentCtaGradient, color: tokens.textOnAccent,
                fontWeight: 800, fontSize: 14, fontFamily: 'inherit', boxShadow: '0 0 24px rgba(245,140,0,.25)',
              }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Add booking
            </button>
          )}

          <input
            aria-label="Search bookings"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, provider, confirmation…"
            style={{
              width: '100%', minHeight: 44, padding: '10px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
              color: DUSK.textPrimary, fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
            }}
          />

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <FilterChip selected={typeFilter === 'all'} onClick={() => setTypeFilter('all')} style={{ flex: 'none' }}>
              All
            </FilterChip>
            {(Object.keys(RESERVATION_TYPE_META) as ReservationType[]).map((type) => (
              <FilterChip key={type} selected={typeFilter === type} onClick={() => setTypeFilter(type)} style={{ flex: 'none' }}>
                {RESERVATION_TYPE_META[type].label}
              </FilterChip>
            ))}
          </div>

          {reservations === null && (
            <div style={{ height: 96, borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
          )}

          {loadError && (
            <RetryCard
              title="Couldn't load your bookings"
              hint="Check your connection — or run the reservations migration if you haven't yet."
              onRetry={() => setReloadToken((token) => token + 1)}
            />
          )}

          {reservations !== null && !loadError && reservations.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 28 }}>
              <TicketsArt />
              <EmptyState
                title="No bookings yet"
                description={canEdit
                  ? 'Add your flights, stays, and tickets so every confirmation lives in one place.'
                  : 'Reservations added by trip editors will appear here.'}
                style={{ minHeight: 0, padding: '10px 16px 24px' }}
              />
            </div>
          )}

          {reservations !== null && !loadError && reservations.length > 0 && filtered.length === 0 && (
            <div style={{ padding: '18px 16px', borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', textAlign: 'center' }}>
              <span style={{ color: tokens.textMuted, fontSize: 12.5 }}>Nothing matches this filter.</span>
            </div>
          )}

          {upcoming.length > 0 && (
            <>
              <div style={SECTION_TITLE_STYLE}>Upcoming</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {upcoming.map((reservation) => (
                  <ReservationCard key={reservation.id} reservation={reservation} onOpen={(entry) => setDetailId(entry.id)} />
                ))}
              </div>
            </>
          )}

          {previous.length > 0 && (
            <>
              <div style={SECTION_TITLE_STYLE}>Previous</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {previous.map((reservation) => (
                  <ReservationCard key={reservation.id} reservation={reservation} onOpen={(entry) => setDetailId(entry.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {detailReservation && (
        <ReservationDetailSheet
          reservation={detailReservation}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(reservation) => {
            setDetailId(null)
            setEditorDraft(draftFromReservation(reservation, fallbackCurrency))
          }}
          onDelete={(reservation) => setPendingDelete(reservation)}
          onViewItinerary={() => {
            setDetailId(null)
            onSelectSection('plan')
          }}
        />
      )}

      <ReservationEditorSheet
        trip={trip}
        draft={editorDraft}
        existingAttachments={
          editorDraft?.id
            ? ((reservations ?? []).find((reservation) => reservation.id === editorDraft.id)?.reservation_attachments ?? [])
            : []
        }
        items={items}
        setItems={setItems}
        itineraryEnabled={itineraryEnabled}
        currentUserId={currentUserId}
        onClose={() => setEditorDraft(null)}
        onSaved={() => refreshReservations(false)}
      />

      {canEdit && (
        <ConfirmDialog
          open={pendingDelete !== null}
          title="Delete booking?"
          message="The booking and its documents will be removed for everyone on this trip."
          onConfirm={() => pendingDelete && deleteReservation(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
