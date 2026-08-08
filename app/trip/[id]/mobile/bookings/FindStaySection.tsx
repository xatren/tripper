'use client'

import { useState } from 'react'
import type { Stop, Trip } from '@/types'
import { EmptyState, MobileListRow, StatusChip, tokens } from '@/components/mobile'
import { BOOKING_PARTNERS, bookingUrl, computeStopSchedule, formatDateRange } from '../trip-domain-utils'

export interface FindStaySectionProps {
  trip: Trip
  stops: Stop[]
}

/**
 * Secondary flow: outbound partner-search links per stop. Deliberately
 * separate from the saved Bookings list — these are searches, not records.
 */
export function FindStaySection({ trip, stops }: FindStaySectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (stops.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18M8 5v14" strokeDasharray="2 2" />
          </svg>
        }
        title="No stops yet"
        description="Add a destination in Plan to see booking links here."
      />
    )
  }

  const nights = Object.fromEntries(stops.map((s) => [s.id, s.nights ?? 1]))
  const schedule = computeStopSchedule(trip.start_date, stops, nights)
  // Day stops (0 nights) are passed through, not slept at, so there is no stay
  // to search for. The schedule stays indexed by the full route so the remaining
  // stops keep their real check-in dates.
  const stayStops = stops
    .map((stop, idx) => ({ stop, slot: schedule[idx] }))
    .filter(({ stop }) => (nights[stop.id] ?? 1) > 0)

  if (stayStops.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18M8 5v14" strokeDasharray="2 2" />
          </svg>
        }
        title="No overnight stops yet"
        description="Every stop on this route is a day stop. Add a night to one in Plan to see booking links here."
      />
    )
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {stayStops.map(({ stop, slot }) => {
        const moreOpen = !!expanded[stop.id]
        const shown = moreOpen ? BOOKING_PARTNERS : BOOKING_PARTNERS.slice(0, 3)
        const arrival = slot?.arrival ?? stop.arrival_date
        const departure = slot?.departure ?? stop.departure_date
        const hasDates = !!(arrival && departure)
        const dateRange = formatDateRange(arrival, departure)
        return (
          <section
            key={stop.id}
            aria-label={`Bookings for ${stop.name}`}
            style={{ background: tokens.surfaceRaised, border: '1px solid rgba(255,255,255,.08)', borderRadius: tokens.radius20, padding: 16, boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: tokens.textPrimary }}>Stay in {stop.name}</div>
                {dateRange && <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 3, fontWeight: 500 }}>{dateRange}</div>}
              </div>
              <a
                href={bookingUrl('Booking.com', stop, arrival, departure)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 44, border: '1px solid rgba(245,140,0,.5)', color: tokens.accentLight, borderRadius: tokens.radiusFull, padding: '8px 13px', flex: 'none', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                <svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Add Stay</span>
              </a>
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
              {shown.map((partner, partnerIdx) => (
                <MobileListRow
                  key={partner}
                  href={bookingUrl(partner, stop, arrival, departure)}
                  linkProps={{ target: '_blank', rel: 'noopener noreferrer' }}
                  leading={partner[0]}
                  title={partner}
                  divider={partnerIdx < shown.length - 1}
                  trailing={
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5 }}>
                      <path d="M6 3L11 8L6 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
              ))}
            </div>

            {BOOKING_PARTNERS.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [stop.id]: !e[stop.id] }))}
                aria-expanded={moreOpen}
                style={{ width: '100%', textAlign: 'center', minHeight: 44, padding: '12px 0 2px', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: tokens.textMuted }}>
                  {moreOpen ? 'Show Fewer Partners' : `Show ${BOOKING_PARTNERS.length - 3} More Partners`}
                </span>
              </button>
            )}

            <div style={{ marginTop: 10 }}>
              {hasDates ? (
                <StatusChip
                  tone="success"
                  icon={
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  }
                  style={{ whiteSpace: 'normal' }}
                >
                  Destination and dates are automatically pre-filled
                </StatusChip>
              ) : (
                <StatusChip
                  tone="neutral"
                  icon={
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" /><path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  }
                  style={{ whiteSpace: 'normal' }}
                >
                  Set trip dates to pre-fill check-in &amp; check-out
                </StatusChip>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
