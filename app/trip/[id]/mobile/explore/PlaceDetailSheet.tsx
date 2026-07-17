'use client'

import { useEffect } from 'react'
import { tokens, FilterChip, StatusChip } from '@/components/mobile'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import { ITEM_TYPE_META } from '../itinerary/itinerary-ui'
import type { ItineraryItemType } from '@/types'
import { DURATION_STEPS_MIN, formatDurationMinutes, type ItemTypeId } from './explore-logic'

export interface PlaceDetailData {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  category?: string
  distanceMeters: number | null
  /** The trip stop distance is measured from, e.g. "Rome". */
  destinationLabel: string | null
}

export interface PlaceDetailSheetProps {
  place: PlaceDetailData | null
  itemType: ItemTypeId
  onItemTypeChange: (type: ItemTypeId) => void
  durationMin: number
  onDurationChange: (minutes: number) => void
  canEdit: boolean
  saving: boolean
  onClose: () => void
  /** Quick one-tap save to the Unscheduled bucket. */
  onSave: () => void
  /** Opens the day-picker sheet. */
  onAddToTrip: () => void
}

const GLYPH_GRADIENTS: Record<ItemTypeId, string> = {
  place: 'linear-gradient(135deg,#0d9488,#0284c7)',
  activity: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
  stay: 'linear-gradient(135deg,#374151,#0f766e)',
  flight: 'linear-gradient(135deg,#065f46,#0369a1)',
  transport: 'linear-gradient(135deg,#b45309,#f59e0b)',
  restaurant: 'linear-gradient(135deg,#be185d,#f97316)',
  reservation: 'linear-gradient(135deg,#7c3aed,#be185d)',
  note: 'linear-gradient(135deg,#374151,#111827)',
  free_time: 'linear-gradient(135deg,#0284c7,#0d9488)',
}

/**
 * Full-screen place detail sheet. There is no real photo, rating, hours, or
 * phone/site to show here — Mapbox's Geocoding API doesn't return them — so
 * the "photo" slot is an explicit category-icon placeholder tile rather than
 * anything meant to look like a real image.
 */
export function PlaceDetailSheet({
  place, itemType, onItemTypeChange, durationMin, onDurationChange, canEdit, saving,
  onClose, onSave, onAddToTrip,
}: PlaceDetailSheetProps) {
  const distanceUnit = useDistanceUnit()

  useEffect(() => {
    if (!place) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [place, onClose])

  if (!place) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-detail-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 140, display: 'flex', flexDirection: 'column',
        background: tokens.bgBase, fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
      <header
        style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 10,
          padding: 'max(12px, env(safe-area-inset-top)) 16px 12px',
          background: tokens.glassStandardFill, borderBottom: `1px solid ${tokens.glassStandardBorder}`,
          backdropFilter: 'blur(var(--glass-standard-blur))', WebkitBackdropFilter: 'blur(var(--glass-standard-blur))',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, cursor: 'pointer' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div id="place-detail-title" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Place details
        </div>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 16px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div
          aria-hidden="true"
          style={{ height: 120, borderRadius: tokens.radius16, background: GLYPH_GRADIENTS[itemType], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.9)' }}
        >
          <span style={{ transform: 'scale(2.4)' }}>{ITEM_TYPE_META[itemType as ItineraryItemType].icon}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em' }}>{place.name}</h2>
          {place.category && (
            <div>
              <StatusChip tone="neutral">{place.category.split(',')[0].trim()}</StatusChip>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: tokens.textSecondary, fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 2 }}><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <span>{place.address}</span>
          </div>
          {place.distanceMeters != null && place.destinationLabel && (
            <div style={{ color: tokens.textMuted, fontSize: 12.5 }}>
              {formatDistanceValue(place.distanceMeters, distanceUnit)} from {place.destinationLabel}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Add as</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(ITEM_TYPE_META) as ItineraryItemType[]).map((type) => (
              <FilterChip key={type} selected={itemType === type} onClick={() => onItemTypeChange(type as ItemTypeId)}>
                {ITEM_TYPE_META[type].label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Estimated visit duration</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterChip selected={durationMin === 0} onClick={() => onDurationChange(0)}>Flexible</FilterChip>
            {DURATION_STEPS_MIN.map((minutes) => (
              <FilterChip key={minutes} selected={durationMin === minutes} onClick={() => onDurationChange(minutes)}>
                {formatDurationMinutes(minutes)}
              </FilterChip>
            ))}
          </div>
        </div>

        {!canEdit && (
          <p style={{ margin: 0, fontSize: 12.5, color: tokens.textMuted, lineHeight: 1.5 }}>
            Only editors can add places to this itinerary.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onAddToTrip}
            disabled={!canEdit || saving}
            style={{
              minHeight: 48, borderRadius: 14, border: 'none', cursor: canEdit && !saving ? 'pointer' : 'default',
              background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, fontSize: 15,
              fontFamily: 'inherit', opacity: canEdit ? 1 : 0.5,
            }}
          >
            Add to trip
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canEdit || saving}
            style={{
              minHeight: 44, borderRadius: 12, cursor: canEdit && !saving ? 'pointer' : 'default',
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
              color: tokens.textPrimary, fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit', opacity: canEdit ? 1 : 0.5,
            }}
          >
            {saving ? 'Saving…' : 'Save for later (Unscheduled)'}
          </button>
        </div>
      </main>
    </div>
  )
}
