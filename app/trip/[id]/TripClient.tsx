'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps'
import { createClient } from '@/lib/supabase/client'
import type { Trip, Stop, Expense, Photo, Profile, NewStopPayload, RouteSegment, HotelResult, ActivityResult } from '@/types'
import { segmentKey } from '@/types'
import { TripMap } from '@/components/trip/trip-map'
import { TripSettings } from '@/components/trip/trip-settings'
import { ItineraryBuilder } from '@/components/trip/itinerary-builder'
import { MapPin } from 'lucide-react'

interface PendingPin {
  lat: number
  lng: number
}

interface TripClientProps {
  trip: Trip
  stops: Stop[]
  expenses: Expense[]
  photos: Photo[]
  profiles: Profile[]
  currentUserId: string
  currentProfile?: Profile
}

export function TripClient(props: TripClientProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <MapPin className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">Google Maps API key not configured</p>
          <p className="mt-2 text-sm text-muted-foreground/70">
            Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local
          </p>
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'routes']}>
      <TripClientContent {...props} />
    </APIProvider>
  )
}

function TripClientContent({
  trip: initialTrip,
  stops: initialStops,
  currentUserId,
}: TripClientProps) {
  const [trip, setTrip] = useState(initialTrip)
  const [stops, setStops] = useState(initialStops)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [nightsByStop, setNightsByStop] = useState<Record<string, number>>({})

  // Pin dialog state
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null)
  const [pinName, setPinName] = useState('')
  const [pinAddress, setPinAddress] = useState('')
  const [isResolvingAddress, setIsResolvingAddress] = useState(false)

  // Route segments cache: segmentKey → RouteSegment
  const [routeSegments, setRouteSegments] = useState<Map<string, RouteSegment>>(new Map())
  const fetchedKeysRef = useRef<Set<string>>(new Set())

  // Hotel markers from Sleep view
  const [hotelMarkers, setHotelMarkers] = useState<HotelResult[]>([])
  // Activity markers from Explore view
  const [activityMarkers, setActivityMarkers] = useState<ActivityResult[]>([])

  const geocodingLib = useMapsLibrary('geocoding')
  const routesLib = useMapsLibrary('routes')
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)

  useEffect(() => {
    if (geocodingLib) geocoderRef.current = new geocodingLib.Geocoder()
  }, [geocodingLib])

  // ── Fetch driving directions for consecutive stop pairs ─────────────
  useEffect(() => {
    if (!routesLib || stops.length < 2) return

    const service = new routesLib.DirectionsService()

    stops.forEach((stop, idx) => {
      if (idx >= stops.length - 1) return
      const next = stops[idx + 1]
      const key = segmentKey(stop.lat, stop.lng, next.lat, next.lng)

      if (fetchedKeysRef.current.has(key)) return
      fetchedKeysRef.current.add(key)

      service.route(
        {
          origin: { lat: stop.lat, lng: stop.lng },
          destination: { lat: next.lat, lng: next.lng },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === 'OK' && result?.routes[0]) {
            const leg = result.routes[0].legs[0]
            const path = result.routes[0].overview_path.map((p) => ({
              lat: p.lat(),
              lng: p.lng(),
            }))
            setRouteSegments((prev) =>
              new Map(prev).set(key, {
                durationText: leg.duration?.text ?? '',
                durationSeconds: leg.duration?.value ?? 0,
                distanceText: leg.distance?.text ?? '',
                distanceMeters: leg.distance?.value ?? 0,
                polylinePath: path,
              })
            )
          } else {
            // Allow retry on failure
            fetchedKeysRef.current.delete(key)
          }
        }
      )
    })
  }, [routesLib, stops])

  // ── Geocoder / pin dialog ────────────────────────────────────────────
  const openPinDialog = useCallback((lat: number, lng: number, name = '', address = '') => {
    setPendingPin({ lat, lng })
    setPinName(name)
    setPinAddress(address)
  }, [])

  const handleMapClick = useCallback(
    (e: { detail: { latLng: google.maps.LatLngLiteral | null } }) => {
      const latLng = e.detail.latLng
      if (!latLng) return
      openPinDialog(latLng.lat, latLng.lng)
      if (geocoderRef.current) {
        setIsResolvingAddress(true)
        geocoderRef.current.geocode({ location: latLng }, (results, status) => {
          setIsResolvingAddress(false)
          if (status === 'OK' && results?.[0]) {
            const first = results[0]
            setPinAddress((curr) => curr || first.formatted_address || '')
            setPinName((curr) => {
              if (curr) return curr
              return first.formatted_address?.split(',')[0]?.trim() || ''
            })
          }
        })
      }
    },
    [openPinDialog]
  )

  const handlePlaceSelected = useCallback(
    (lat: number, lng: number, name: string, address: string) => {
      openPinDialog(lat, lng, name, address)
    },
    [openPinDialog]
  )

  const handleCancelPin = useCallback(() => {
    setPendingPin(null)
    setPinName('')
    setPinAddress('')
  }, [])

  // ── Nights ───────────────────────────────────────────────────────────
  useEffect(() => {
    setNightsByStop((prev) => {
      const next = { ...prev }
      for (const s of stops) {
        if (next[s.id] === undefined) {
          if (s.arrival_date && s.departure_date) {
            const ms = new Date(s.departure_date).getTime() - new Date(s.arrival_date).getTime()
            next[s.id] = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
          } else {
            next[s.id] = 1
          }
        }
      }
      return next
    })
  }, [stops])

  const handleChangeNights = useCallback((stopId: string, nights: number) => {
    setNightsByStop((prev) => ({ ...prev, [stopId]: nights }))
  }, [])

  // ── Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    const stopsChannel = supabase
      .channel('stops-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stops', filter: `trip_id=eq.${trip.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setStops((prev) =>
              [...prev, payload.new as Stop].sort((a, b) => a.order_index - b.order_index)
            )
          } else if (payload.eventType === 'UPDATE') {
            setStops((prev) =>
              prev
                .map((s) => (s.id === payload.new.id ? (payload.new as Stop) : s))
                .sort((a, b) => a.order_index - b.order_index)
            )
          } else if (payload.eventType === 'DELETE') {
            setStops((prev) => prev.filter((s) => s.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    const tripChannel = supabase
      .channel('trip-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` },
        (payload) => setTrip(payload.new as Trip)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(stopsChannel)
      supabase.removeChannel(tripChannel)
    }
  }, [trip.id])

  // ── Stop CRUD ────────────────────────────────────────────────────────
  const handleAddStop = useCallback(
    async (payload: NewStopPayload) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('stops')
        .insert({
          trip_id: trip.id,
          name: payload.name,
          lat: payload.lat,
          lng: payload.lng,
          address: payload.address,
          state: payload.state,
          notes: payload.notes,
          description: payload.description,
          place_category: payload.place_category,
          rating: payload.rating,
          estimated_cost: payload.estimated_cost,
          day_number: payload.day_number,
          arrival_date: payload.arrival_date,
          is_favorite: payload.is_favorite,
          order_index: stops.length,
          stop_type: stops.length === 0 ? 'origin' : 'destination',
          created_by: currentUserId,
        })
        .select()
        .single()
      if (!error && data) setStops((prev) => [...prev, data as Stop])
    },
    [trip.id, stops.length, currentUserId]
  )

  const handleConfirmPin = useCallback(
    async (payload: NewStopPayload) => {
      await handleAddStop(payload)
      setPendingPin(null)
      setPinName('')
      setPinAddress('')
    },
    [handleAddStop]
  )

  const handleUpdateStop = useCallback(async (stopId: string, updates: Partial<Stop>) => {
    const supabase = createClient()
    const { error } = await supabase.from('stops').update(updates).eq('id', stopId)
    if (!error) setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, ...updates } : s)))
  }, [])

  const handleDeleteStop = useCallback(
    async (stopId: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('stops').delete().eq('id', stopId)
      if (!error) {
        setStops((prev) => prev.filter((s) => s.id !== stopId))
        if (selectedStopId === stopId) setSelectedStopId(null)
      }
    },
    [selectedStopId]
  )

  const handleReorderStops = useCallback(async (reordered: Stop[]) => {
    // Optimistic update — UI reflects new order immediately
    setStops(reordered)
    // Persist new order_index values to Supabase
    const supabase = createClient()
    await Promise.all(
      reordered.map((stop, idx) =>
        supabase.from('stops').update({ order_index: idx }).eq('id', stop.id)
      )
    )
  }, [])

  const isOwner = trip.owner_id === currentUserId
  const handleCopyInvite = useCallback(() => {
    navigator.clipboard.writeText(trip.invite_code || '')
  }, [trip.invite_code])

  return (
    <>
      <ItineraryBuilder
        trip={trip}
        stops={stops}
        nightsByStop={nightsByStop}
        onChangeNights={handleChangeNights}
        selectedStopId={selectedStopId}
        onSelectStop={setSelectedStopId}
        onPlaceSelected={handlePlaceSelected}
        onDeleteStop={handleDeleteStop}
        onReorderStops={handleReorderStops}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCollaborators={handleCopyInvite}
        isOwner={isOwner}
        routeSegments={routeSegments}
        tripId={trip.id}
        currentUserId={currentUserId}
        onHotelsChanged={setHotelMarkers}
        onActivitiesChanged={setActivityMarkers}
        mapSlot={
          <TripMap
            stops={stops}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
            onAddStop={handleAddStop}
            onUpdateStopPosition={async (stopId, lat, lng) => {
              await handleUpdateStop(stopId, { lat, lng })
            }}
            pendingPin={pendingPin}
            pinName={pinName}
            pinAddress={pinAddress}
            isResolvingAddress={isResolvingAddress}
            onMapClick={handleMapClick}
            onConfirmPin={handleConfirmPin}
            onCancelPin={handleCancelPin}
            routeSegments={routeSegments}
            hotelMarkers={hotelMarkers}
            activityMarkers={activityMarkers}
          />
        }
      />

      {isOwner && (
        <TripSettings
          trip={trip}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  )
}
