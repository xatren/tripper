'use client'

import { tokens } from '@/components/mobile'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import { straightLineMeters } from './itinerary-ui'

export interface TravelSegmentRowProps {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  /** Known driving leg (from the route) — preferred over the crow-flies estimate. */
  legDurationText?: string
  legDistanceMeters?: number
  variant?: 'plan' | 'daily'
}

/**
 * Connector between two located rows on the same day. Shows the real route leg
 * when one exists, otherwise an honest straight-line distance ("≈ 4 km apart").
 */
export function TravelSegmentRow({ fromLat, fromLng, toLat, toLng, legDurationText, legDistanceMeters, variant = 'plan' }: TravelSegmentRowProps) {
  const distanceUnit = useDistanceUnit()
  const meters = legDistanceMeters ?? straightLineMeters(fromLat, fromLng, toLat, toLng)
  // Sub-250 m hops are noise, not travel.
  if (meters < 250) return null
  const distance = formatDistanceValue(meters, distanceUnit)
  const label = legDurationText ? `${legDurationText} · ${distance}` : `≈ ${distance} apart`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: variant === 'daily' ? '1px 0 1px 27px' : '2px 0 2px 40px', minHeight: variant === 'daily' ? 28 : undefined }}>
      <div aria-hidden="true" style={{ width: 2, height: 22, background: 'repeating-linear-gradient(to bottom, rgba(245,140,0,.45) 0 4px, transparent 4px 8px)' }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: tokens.textMuted, whiteSpace: 'nowrap' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
          <path d="M3 12l2-6a2 2 0 0 1 2-1.4h10a2 2 0 0 1 2 1.4l2 6" /><rect x="2" y="12" width="20" height="6" rx="2" /><circle cx="7" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" />
        </svg>
        {label}
      </span>
    </div>
  )
}
