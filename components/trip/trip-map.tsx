'use client'

import { useCallback, useEffect } from 'react'
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { Button } from '@/components/ui/button'
import { MapPin, Navigation } from 'lucide-react'
import type { Stop, NewStopPayload, RouteSegment, HotelResult, ActivityResult } from '@/types'
import { segmentKey, ACTIVITY_CATEGORY_CONFIG } from '@/types'
import { AddLocationDialog } from '@/components/trip/add-location-dialog'

interface PendingPin {
  lat: number
  lng: number
}

interface TripMapProps {
  stops: Stop[]
  selectedStopId: string | null
  onSelectStop: (id: string | null) => void
  onAddStop: (payload: NewStopPayload) => void
  onUpdateStopPosition: (stopId: string, lat: number, lng: number) => void
  // Pin dialog
  pendingPin: PendingPin | null
  pinName: string
  pinAddress: string
  isResolvingAddress: boolean
  onMapClick: (e: { detail: { latLng: google.maps.LatLngLiteral | null } }) => void
  onConfirmPin: (payload: NewStopPayload) => void
  onCancelPin: () => void
  // Route segments (road paths + durations)
  routeSegments?: Map<string, RouteSegment>
  // Hotel markers (sleep view)
  hotelMarkers?: HotelResult[]
  // Activity markers (explore view)
  activityMarkers?: ActivityResult[]
}

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }
const DEFAULT_ZOOM = 4

export function TripMap({
  stops,
  selectedStopId,
  onSelectStop,
  onUpdateStopPosition,
  pendingPin,
  pinName,
  pinAddress,
  isResolvingAddress,
  onMapClick,
  onConfirmPin,
  onCancelPin,
  routeSegments,
  hotelMarkers,
  activityMarkers,
}: TripMapProps) {
  const map = useMap()

  useEffect(() => {
    if (!map || stops.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    stops.forEach((stop) => bounds.extend({ lat: stop.lat, lng: stop.lng }))
    map.fitBounds(bounds, 80)
    if (stops.length === 1) map.setZoom(Math.min(map.getZoom() || 12, 12))
  }, [map, stops])

  useEffect(() => {
    if (!map || !selectedStopId) return
    const stop = stops.find((s) => s.id === selectedStopId)
    if (stop) map.panTo({ lat: stop.lat, lng: stop.lng })
  }, [map, selectedStopId, stops])

  const handleMarkerDragEnd = useCallback(
    (stopId: string, e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      onUpdateStopPosition(stopId, e.latLng.lat(), e.latLng.lng())
    },
    [onUpdateStopPosition]
  )

  const mapCenter =
    stops.length > 0
      ? {
          lat: stops.reduce((s, st) => s + st.lat, 0) / stops.length,
          lng: stops.reduce((s, st) => s + st.lng, 0) / stops.length,
        }
      : DEFAULT_CENTER

  return (
    <div className="relative h-full w-full">
      <Map
        defaultCenter={mapCenter}
        defaultZoom={stops.length > 0 ? 6 : DEFAULT_ZOOM}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI
        onClick={onMapClick}
        className="h-full w-full"
      >
        {/* Road routes (one polyline per consecutive pair) */}
        {stops.length > 1 &&
          stops.slice(0, -1).map((stop, idx) => {
            const next = stops[idx + 1]
            const key = segmentKey(stop.lat, stop.lng, next.lat, next.lng)
            const segment = routeSegments?.get(key)
            return (
              <RoadSegment
                key={key}
                from={stop}
                to={next}
                segment={segment}
              />
            )
          })}

        {/* Stop markers */}
        {stops.map((stop, index) => (
          <AdvancedMarker
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            onClick={() => onSelectStop(stop.id)}
            draggable
            onDragEnd={(e) => handleMarkerDragEnd(stop.id, e)}
          >
            <StopMarker
              index={index}
              name={stop.name}
              isSelected={stop.id === selectedStopId}
            />
          </AdvancedMarker>
        ))}

        {/* Hotel markers (sleep view) */}
        {hotelMarkers?.map((hotel) => (
          <AdvancedMarker
            key={hotel.placeId}
            position={{ lat: hotel.lat, lng: hotel.lng }}
          >
            <HotelMarker name={hotel.name} rating={hotel.rating} />
          </AdvancedMarker>
        ))}

        {/* Activity markers (explore view) */}
        {activityMarkers?.map((activity) => (
          <AdvancedMarker
            key={activity.placeId}
            position={{ lat: activity.lat, lng: activity.lng }}
          >
            <ActivityMarker
              name={activity.name}
              category={activity.category}
              rating={activity.rating}
            />
          </AdvancedMarker>
        ))}

        {/* Pending pin preview */}
        {pendingPin && (
          <AdvancedMarker position={{ lat: pendingPin.lat, lng: pendingPin.lng }}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
              <MapPin className="h-4 w-4" />
            </div>
          </AdvancedMarker>
        )}
      </Map>

      {/* My location button */}
      <div className="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
        <Button
          size="icon"
          variant="secondary"
          className="bg-card/95 backdrop-blur-sm"
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition((pos) => {
                map?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                map?.setZoom(12)
              })
            }
          }}
          title="My location"
        >
          <Navigation className="h-4 w-4" />
        </Button>
      </div>

      {pendingPin && (
        <AddLocationDialog
          open
          lat={pendingPin.lat}
          lng={pendingPin.lng}
          initialName={pinName}
          initialAddress={pinAddress}
          isResolvingAddress={isResolvingAddress}
          onCancel={onCancelPin}
          onConfirm={onConfirmPin}
        />
      )}
    </div>
  )
}

// ── Road segment polyline ─────────────────────────────────────────────

function RoadSegment({
  from,
  to,
  segment,
}: {
  from: Stop
  to: Stop
  segment: RouteSegment | undefined
}) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    const path = segment?.polylinePath ?? [
      { lat: from.lat, lng: from.lng },
      { lat: to.lat, lng: to.lng },
    ]

    const polyline = new google.maps.Polyline({
      path,
      strokeColor: segment ? '#d4a257' : '#d4a257',
      strokeOpacity: segment ? 0.85 : 0.4,
      strokeWeight: segment ? 4 : 2,
      geodesic: !segment, // geodesic only for fallback straight line
      icons: segment
        ? undefined
        : [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
              offset: '0',
              repeat: '16px',
            },
          ],
    })

    polyline.setMap(map)
    return () => {
      polyline.setMap(null)
    }
  }, [map, from, to, segment])

  return null
}

// ── Hotel marker ──────────────────────────────────────────────────────

function HotelMarker({ name, rating }: { name: string; rating?: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 shadow-lg ring-2 ring-emerald-400/40 ring-offset-1 ring-offset-background">
        <span className="text-[11px]">🛏</span>
      </div>
      {rating !== undefined && (
        <div className="mt-0.5 max-w-[80px] truncate rounded bg-card/95 px-1.5 py-0.5 text-[9px] font-semibold text-foreground shadow backdrop-blur-sm">
          ★ {rating.toFixed(1)}
        </div>
      )}
    </div>
  )
}

// ── Activity marker ───────────────────────────────────────────────────

function ActivityMarker({
  name,
  category,
  rating,
}: {
  name: string
  category: ActivityResult['category']
  rating?: number | null
}) {
  const cfg = ACTIVITY_CATEGORY_CONFIG[category]
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full shadow-lg ring-2 ring-white/20 ring-offset-1 ring-offset-background"
        style={{ backgroundColor: cfg.color }}
      >
        <span className="text-[11px]">{cfg.icon}</span>
      </div>
      {rating !== undefined && rating !== null && (
        <div className="mt-0.5 max-w-[80px] truncate rounded bg-card/95 px-1.5 py-0.5 text-[9px] font-semibold text-foreground shadow backdrop-blur-sm">
          ★ {rating.toFixed(1)}
        </div>
      )}
    </div>
  )
}

// ── Stop marker ───────────────────────────────────────────────────────

function StopMarker({
  index,
  name,
  isSelected,
}: {
  index: number
  name: string
  isSelected: boolean
}) {
  return (
    <div className={`flex flex-col items-center ${isSelected ? 'scale-110' : ''} transition-transform`}>
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full font-bold shadow-lg ${
          isSelected
            ? 'bg-primary text-primary-foreground ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
            : 'bg-card text-foreground border-2 border-primary'
        }`}
      >
        {index + 1}
      </div>
      {isSelected && (
        <div className="mt-1 max-w-[120px] truncate rounded bg-card/95 px-2 py-1 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
          {name}
        </div>
      )}
    </div>
  )
}
