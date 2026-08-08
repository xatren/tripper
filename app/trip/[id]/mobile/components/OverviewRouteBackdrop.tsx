'use client'

import { useMemo, useState } from 'react'
import type { Stop, Trip } from '@/types'
import { TripboxMap, type TripboxMapPoint } from '@/components/map/mapbox/TripboxMap'
import { buildRouteMapPins, tripDayCountFromDates } from '@/lib/map-pins'
import { projectStopSchedule } from '../itinerary-projection'

interface OverviewRouteBackdropProps {
  trip: Trip
  stops: Stop[]
  routePath: { lat: number; lng: number }[]
}

function DuskMapFallback({ points }: { points: TripboxMapPoint[] }) {
  const routePoints = points
    .map((_, index) => `${18 + index * (64 / Math.max(1, points.length - 1))},${34 + (index % 3) * 15}`)
    .join(' ')

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(circle at 72% 24%, rgba(71,83,154,.38), transparent 31%), radial-gradient(circle at 22% 72%, rgba(107,54,145,.28), transparent 34%), linear-gradient(155deg,#101333,#070718 72%)' }}>
      <span style={{ position: 'absolute', left: '-15%', right: '-15%', top: '44%', height: 1, rotate: '-12deg', background: 'rgba(255,255,255,.07)' }} />
      <span style={{ position: 'absolute', left: '-15%', right: '-15%', top: '62%', height: 1, rotate: '9deg', background: 'rgba(255,255,255,.055)' }} />
      <span style={{ position: 'absolute', left: '-15%', right: '-15%', top: '78%', height: 1, rotate: '-5deg', background: 'rgba(255,255,255,.045)' }} />
      {points.length > 1 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <polyline points={routePoints} fill="none" stroke="rgba(245,166,35,.25)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={routePoints} fill="none" stroke="#f5a623" strokeWidth=".65" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1.5 1.8" />
        </svg>
      )}
      {/* Mirrors the live map's hierarchy so a Mapbox failure doesn't flip the
          route back to equal-weight pins. */}
      {points.map((point, index) => {
        const waypoint = point.kind === 'waypoint'
        const destination = !waypoint && point.role === 'end'
        return (
          <span
            key={point.id}
            style={{ position: 'absolute', left: `${18 + index * (64 / Math.max(1, points.length - 1))}%`, top: `${34 + (index % 3) * 15}%`, width: waypoint ? 11 : 24, height: waypoint ? 11 : 24, translate: '-50% -50%', display: 'grid', placeItems: 'center', borderRadius: destination ? 7 : '50%', rotate: destination ? '45deg' : undefined, background: point.markerColor ?? (waypoint ? '#77779a' : '#f5a623'), border: `${waypoint ? 1.5 : 3}px solid #0a1020`, boxShadow: waypoint ? 'none' : '0 0 16px rgba(245,166,35,.32)', color: '#191206', fontSize: 9, fontWeight: 850 }}
          >
            {!waypoint && <span style={{ rotate: destination ? '-45deg' : undefined }}>{point.label}</span>}
          </span>
        )
      })}
    </div>
  )
}

/** Map Home-flavoured, non-interactive route layer behind the Overview content. */
export function OverviewRouteBackdrop({ trip, stops, routePath }: OverviewRouteBackdropProps) {
  const [mapFailed, setMapFailed] = useState(false)
  const validStops = useMemo(
    () => stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
    [stops],
  )
  // Overnight stays carry the day badge; day stops recede to unlabeled dots. The
  // green/purple start and end accents only apply to a stay — on a day stop they
  // would fight the muted treatment that keeps the backdrop readable.
  const points = useMemo<TripboxMapPoint[]>(() => {
    const schedule = projectStopSchedule(trip.start_date ?? null, validStops)
    const pins = buildRouteMapPins(
      validStops.map((stop, index) => ({
        id: stop.id,
        lat: stop.lat,
        lng: stop.lng,
        name: stop.name,
        address: stop.address,
        nights: stop.nights,
        dayStart: schedule[index].dayStart,
      })),
      tripDayCountFromDates(trip.start_date, trip.end_date),
    )
    return pins.map((pin) => ({
      ...pin,
      markerColor: pin.kind === 'waypoint' ? undefined : pin.role === 'start' ? '#34d399' : pin.role === 'end' ? '#a78bfa' : undefined,
    }))
  }, [trip.end_date, trip.start_date, validStops])
  const defaultCenter = useMemo(() => {
    if (trip.focus_lat != null && trip.focus_lng != null) return { lat: trip.focus_lat, lng: trip.focus_lng }
    const country = trip.countries?.slice().sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))[0]
    return country ? { lat: country.lat, lng: country.lng } : undefined
  }, [trip.countries, trip.focus_lat, trip.focus_lng])

  return (
    <div aria-hidden="true" inert style={{ position: 'absolute', zIndex: 0, inset: 0, maxWidth: 480, margin: '0 auto', overflow: 'hidden', pointerEvents: 'none', background: '#08081e' }}>
      {mapFailed ? <DuskMapFallback points={points} /> : (
        <TripboxMap
          points={points}
          routePath={routePath}
          interactive={false}
          defaultCenter={defaultCenter}
          defaultZoom={points.length > 0 ? 5 : 2.4}
          onMapError={() => setMapFailed(true)}
          fitPadding={{ top: 126, right: 34, bottom: 210, left: 34 }}
          showZoomControls={false}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,5,20,.48) 0%, rgba(5,5,20,.12) 28%, rgba(8,7,26,.18) 52%, rgba(10,8,28,.78) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,4,18,.20)', backdropFilter: 'blur(6px) saturate(.78)', WebkitBackdropFilter: 'blur(6px) saturate(.78)' }} />
    </div>
  )
}
