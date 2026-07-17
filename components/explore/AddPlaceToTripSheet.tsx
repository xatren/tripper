'use client'

import { useEffect, useMemo, useState } from 'react'
import { FilterChip, MobileBottomSheet, tokens } from '@/components/mobile'
import type { ItineraryItemType, MemberRole } from '@/types'
import type { DuplicateMatch } from '@/lib/google-places/pure'
import { formatDurationMinutes, tripDayOptions } from '@/lib/google-places/pure'
import type { GooglePlaceSearchResult } from '@/lib/google-places/types'

export interface ExploreTripOption {
  id: string
  title: string
  startDate: string | null
  endDate: string | null
  role: MemberRole
}

export interface AddPlaceInput {
  tripId: string
  title: string
  localDate: string | null
  startTime: string
  durationMinutes: number
  itemType: ItineraryItemType
}

const FIELD: React.CSSProperties = { width: '100%', minHeight: 44, boxSizing: 'border-box', borderRadius: tokens.radius12, border: '1px solid rgba(255,255,255,.14)', background: tokens.surfaceSolid, color: tokens.textPrimary, padding: '9px 12px', fontFamily: 'inherit', fontSize: 14 }
const TYPES: ItineraryItemType[] = ['place', 'activity', 'restaurant', 'stay', 'transport', 'flight', 'reservation']
const DURATIONS = [0, 30, 45, 60, 90, 120, 180, 240]

export function AddPlaceToTripSheet({ place, trips, lockedTripId, defaultUnscheduled, itemType, durationMinutes, duplicate, tripDataLoading, saving, onTripChange, onViewExisting, onClose, onConfirm }: {
  place: GooglePlaceSearchResult | null
  trips: ExploreTripOption[]
  lockedTripId?: string
  defaultUnscheduled: boolean
  itemType: ItineraryItemType
  durationMinutes: number
  duplicate: DuplicateMatch | null
  tripDataLoading: boolean
  saving: boolean
  onTripChange: (tripId: string) => void
  onViewExisting: (match: DuplicateMatch) => void
  onClose: () => void
  onConfirm: (input: AddPlaceInput) => void
}) {
  const firstEditable = trips.find((trip) => trip.role !== 'viewer')?.id ?? ''
  const [tripId, setTripId] = useState(lockedTripId ?? firstEditable)
  const [title, setTitle] = useState(place?.name ?? '')
  const [localDate, setLocalDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [type, setType] = useState(itemType)
  const [duration, setDuration] = useState(durationMinutes)
  useEffect(() => {
    const nextTrip = lockedTripId ?? firstEditable
    setTripId(nextTrip); setTitle(place?.name ?? ''); setLocalDate(''); setStartTime(''); setType(itemType); setDuration(durationMinutes)
    if (nextTrip) onTripChange(nextTrip)
  }, [place, lockedTripId, firstEditable, itemType, durationMinutes, onTripChange])
  const trip = trips.find((entry) => entry.id === tripId) ?? null
  const days = useMemo(() => tripDayOptions(trip?.startDate ?? null, trip?.endDate ?? null), [trip])
  const canEdit = !!trip && trip.role !== 'viewer'

  const changeTrip = (value: string) => { setTripId(value); setLocalDate(''); setStartTime(''); onTripChange(value) }
  return (
    <MobileBottomSheet open={!!place} onClose={onClose} title={defaultUnscheduled ? 'Save to trip' : 'Add to trip'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!lockedTripId && (
          <label><span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>TRIP</span>
            <select value={tripId} onChange={(event) => changeTrip(event.target.value)} style={FIELD}>
              {!trips.length && <option value="">No accessible trips</option>}
              {trips.map((option) => <option key={option.id} value={option.id} disabled={option.role === 'viewer'}>{option.title} · {option.role === 'viewer' ? 'Viewer (read only)' : option.role}</option>)}
            </select>
          </label>
        )}
        <label><span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>TITLE FOR YOUR ITINERARY</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} style={FIELD} /></label>
        <p style={{ margin: '-8px 0 0', color: tokens.textMuted, fontSize: 11.5, lineHeight: 1.4 }}>This editable title is saved as your itinerary content. Google provider details are not cached in the database.</p>
        {!defaultUnscheduled && <label><span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>DAY</span><select value={localDate} onChange={(event) => { setLocalDate(event.target.value); if (!event.target.value) setStartTime('') }} style={FIELD}><option value="">Unscheduled</option>{days.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>}
        {!defaultUnscheduled && <label><span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>START TIME (OPTIONAL)</span><input type="time" value={startTime} disabled={!localDate} onChange={(event) => setStartTime(event.target.value)} style={FIELD} /></label>}
        <section><span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 7 }}>DURATION</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{DURATIONS.map((value) => <FilterChip key={value} selected={duration === value} onClick={() => setDuration(value)}>{formatDurationMinutes(value)}</FilterChip>)}</div></section>
        <section><span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 7 }}>ITEM TYPE</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{TYPES.map((value) => <FilterChip key={value} selected={type === value} onClick={() => setType(value)}>{value.replace('_', ' ')}</FilterChip>)}</div></section>
        {tripDataLoading && <div role="status" aria-live="polite" style={{ color: tokens.textMuted, fontSize: 12.5 }}>Checking this trip for duplicates…</div>}
        {duplicate && <div role="alert" style={{ padding: 12, borderRadius: tokens.radius12, border: '1px solid rgba(251,191,36,.32)', background: 'rgba(251,191,36,.10)', color: tokens.textSecondary, fontSize: 12.5, lineHeight: 1.45 }}>Already found: <strong style={{ color: tokens.textPrimary }}>{duplicate.title}</strong> · {duplicate.localDate ?? 'Unscheduled'}<div><button type="button" onClick={() => onViewExisting(duplicate)} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: tokens.accentLight, fontWeight: 800, cursor: 'pointer' }}>View existing</button></div></div>}
        {!canEdit && <p style={{ margin: 0, color: tokens.textMuted, fontSize: 12.5 }}>Only owners and editors can add places to this trip.</p>}
        <button type="button" disabled={!canEdit || saving || tripDataLoading || !title.trim()} onClick={() => onConfirm({ tripId, title: title.trim(), localDate: defaultUnscheduled ? null : localDate || null, startTime: defaultUnscheduled ? '' : startTime, durationMinutes: duration, itemType: type })} style={{ minHeight: 48, border: 0, borderRadius: tokens.radius16, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontFamily: 'inherit', fontWeight: 800, opacity: !canEdit || saving || tripDataLoading || !title.trim() ? .55 : 1, cursor: canEdit && !saving ? 'pointer' : 'default' }}>{saving ? 'Adding…' : duplicate ? 'Add anyway' : defaultUnscheduled ? 'Save to Unscheduled' : 'Add to trip'}</button>
      </div>
    </MobileBottomSheet>
  )
}
