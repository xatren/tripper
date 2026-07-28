'use client'

import { useEffect, useState } from 'react'
import { tokens, MobileBottomSheet, FilterChip } from '@/components/mobile'
import { ITEM_TYPE_META } from '../itinerary/itinerary-ui'
import type { ItineraryItemType } from '@/types'
import type { DuplicateMatch, ItemTypeId } from './explore-logic'
import type { PlaceDetailData } from './PlaceDetailSheet'

export interface DayOption {
  /** YYYY-MM-DD, or '' for the unscheduled bucket. */
  value: string
  label: string
}

export interface AddToTripSheetProps {
  place: PlaceDetailData | null
  itemType: ItemTypeId
  onItemTypeChange: (type: ItemTypeId) => void
  dayOptions: DayOption[]
  duplicate: DuplicateMatch | null
  saving: boolean
  onClose: () => void
  onConfirm: (input: { localDate: string | null; startTime: string }) => void
}

const FIELD_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12,
  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
  color: tokens.textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
}

/** Day/time/type picker that commits a search result into the trip's itinerary. */
export function AddToTripSheet({ place, itemType, onItemTypeChange, dayOptions, duplicate, saving, onClose, onConfirm }: AddToTripSheetProps) {
  const [localDate, setLocalDate] = useState('')
  const [startTime, setStartTime] = useState('')

  useEffect(() => {
    setLocalDate('')
    setStartTime('')
  }, [place])

  const open = !!place

  return (
    <MobileBottomSheet open={open} onClose={onClose} title="Add to trip">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {place && (
          <div style={{ fontSize: 13.5, color: tokens.textSecondary }}>
            Adding <strong style={{ color: tokens.textPrimary }}>{place.name}</strong>
          </div>
        )}

        {duplicate && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px',
              background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)',
              borderRadius: tokens.radius12, color: tokens.textSecondary, fontSize: 12.5, lineHeight: 1.5,
            }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', marginTop: 2, color: tokens.warning }}>
              <path d="M8 1.5 15 14H1L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 6.5v3.2M8 12h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>
              This looks like it might already be in your trip, close to{' '}
              <strong style={{ color: tokens.textPrimary }}>{duplicate.title}</strong>
              {duplicate.source === 'stop' ? ' (a destination on your route)' : ' (already on your itinerary)'}.
            </span>
          </div>
        )}

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Day</span>
          <select value={localDate} onChange={(e) => setLocalDate(e.target.value)} style={FIELD_STYLE}>
            <option value="">Unscheduled</option>
            {dayOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Start time (optional)</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={!localDate}
            style={FIELD_STYLE}
          />
        </label>

        <div>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Add as</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(ITEM_TYPE_META) as ItineraryItemType[]).map((type) => (
              <FilterChip key={type} selected={itemType === type} onClick={() => onItemTypeChange(type as ItemTypeId)}>
                {ITEM_TYPE_META[type].label}
              </FilterChip>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onConfirm({ localDate: localDate || null, startTime })}
          disabled={saving}
          style={{
            minHeight: 48, borderRadius: 14, border: 'none', cursor: saving ? 'default' : 'pointer',
            background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, fontSize: 15,
            fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Adding…' : duplicate ? 'Add anyway' : 'Add to trip'}
        </button>
      </div>
    </MobileBottomSheet>
  )
}
