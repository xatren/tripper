'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import { FilterChip, tokens } from '@/components/mobile'
import type { ItineraryItem, ItineraryItemType, Stop, Trip } from '@/types'
import { googleCategory, googleTypeToItineraryType, type GooglePlaceCategoryId } from '@/lib/google-places/category-map'
import { findPlaceDuplicate, type DuplicateMatch, type DuplicateSource } from '@/lib/google-places/pure'
import type { GooglePlaceErrorCode, GooglePlaceSearchResult, PlacesDetailsResponse, PlacesErrorResponse, PlacesSearchResponse } from '@/lib/google-places/types'
import { ExploreSearchInput } from './ExploreSearchInput'
import { ExploreCategoryChips } from './ExploreCategoryChips'
import { ExploreResultsList, type ExploreSearchState } from './ExploreResultsList'
import { GoogleExploreMap } from './GoogleExploreMap'
import { GooglePlaceDetailSheet, type DetailState } from './GooglePlaceDetailSheet'
import { AddPlaceToTripSheet, type AddPlaceInput, type ExploreTripOption } from './AddPlaceToTripSheet'

interface TripData { stops: Stop[]; items: ItineraryItem[] }

export interface GooglePlacesExplorerProps {
  mode: 'global' | 'trip'
  trips: ExploreTripOption[]
  activeTrip?: Trip
  activeStops?: Stop[]
  activeItems?: ItineraryItem[]
  setActiveItems?: React.Dispatch<React.SetStateAction<ItineraryItem[]>>
  currentUserId: string
  canEdit: boolean
  itineraryEnabled: boolean
  onViewItinerary?: () => void
}

const DEBOUNCE_MS = 300

function parseError(value: unknown, fallback: GooglePlaceErrorCode = 'provider_unavailable'): { code: GooglePlaceErrorCode; retryable: boolean } {
  const error = (value as Partial<PlacesErrorResponse> | null)?.error
  return { code: error?.code ?? fallback, retryable: error?.retryable ?? true }
}

function deviceTimezone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null } catch { return null }
}

/** local_date remains authoritative because Tripper does not yet own a reliable destination timezone. */
function instantForDeviceZone(localDate: string | null, startTime: string): string | null {
  if (!localDate || !startTime) return null
  const date = new Date(`${localDate}T${startTime}:00`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function GooglePlacesExplorer({ mode, trips, activeTrip, activeStops = [], activeItems = [], setActiveItems, currentUserId, canEdit, itineraryEnabled, onViewItinerary }: GooglePlacesExplorerProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<GooglePlaceCategoryId>('all')
  const [selectedStopId, setSelectedStopId] = useState<string | null>(activeStops[0]?.id ?? null)
  const [composing, setComposing] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [searchState, setSearchState] = useState<ExploreSearchState>({ status: 'idle' })
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [detailSummary, setDetailSummary] = useState<GooglePlaceSearchResult | null>(null)
  const [detailState, setDetailState] = useState<DetailState | null>(null)
  const [itemType, setItemType] = useState<ItineraryItemType>('place')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [addPlace, setAddPlace] = useState<GooglePlaceSearchResult | null>(null)
  const [saveToUnscheduled, setSaveToUnscheduled] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState(activeTrip?.id ?? trips.find((trip) => trip.role !== 'viewer')?.id ?? '')
  const [tripData, setTripData] = useState<Record<string, TripData>>({})
  const [tripDataLoading, setTripDataLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const searchAbort = useRef<AbortController | null>(null)
  const detailAbort = useRef<AbortController | null>(null)
  const searchSequence = useRef(0)
  const detailSequence = useRef(0)
  const tripSequence = useRef(0)

  useEffect(() => { if (!selectedStopId && activeStops[0]) setSelectedStopId(activeStops[0].id) }, [activeStops, selectedStopId])
  const selectedStop = useMemo(() => activeStops.find((stop) => stop.id === selectedStopId) ?? activeStops[0] ?? null, [activeStops, selectedStopId])
  const proximity = useMemo(() => selectedStop ? { lat: selectedStop.lat, lng: selectedStop.lng }
    : activeTrip?.focus_lat != null && activeTrip.focus_lng != null ? { lat: activeTrip.focus_lat, lng: activeTrip.focus_lng } : null, [selectedStop, activeTrip])

  const results = useMemo(() => searchState.status === 'ready' ? searchState.results : [], [searchState])
  const queryKey = `${query.trim()}|${category}|${proximity?.lat ?? ''}|${proximity?.lng ?? ''}|${retryNonce}`

  useEffect(() => {
    const sequence = ++searchSequence.current
    const trimmed = query.trim().replace(/\s+/g, ' ')
    const canNearby = category !== 'all' && !!proximity
    if (composing || (trimmed.length < 2 && !canNearby)) {
      searchAbort.current?.abort()
      setSearchState({ status: 'idle' })
      setSelectedPlaceId(null)
      return
    }
    setSearchState({ status: 'loading' })
    const timer = setTimeout(() => {
      searchAbort.current?.abort()
      const controller = new AbortController()
      searchAbort.current = controller
      const params = new URLSearchParams({ q: trimmed.length >= 2 ? trimmed : '', category, limit: '10' })
      if (proximity) { params.set('lat', String(proximity.lat)); params.set('lng', String(proximity.lng)); params.set('radius', '50000') }
      fetch(`/api/places/search?${params}`, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          const body: unknown = await response.json().catch(() => null)
          if (sequence !== searchSequence.current) return
          if (!response.ok) { const error = parseError(body, response.status === 401 ? 'unauthorized' : 'provider_unavailable'); setSearchState({ status: 'error', ...error }); return }
          const next = (body as PlacesSearchResponse).results ?? []
          setSearchState({ status: 'ready', results: next })
          setSelectedPlaceId((current) => current && next.some((place) => place.placeId === current) ? current : null)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          if (sequence === searchSequence.current) setSearchState({ status: 'error', code: navigator.onLine ? 'network' : 'network', retryable: true })
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, category, proximity, composing, retryNonce])

  useEffect(() => () => { searchAbort.current?.abort(); detailAbort.current?.abort() }, [])

  const loadDetail = useCallback((summary: GooglePlaceSearchResult) => {
    const sequence = ++detailSequence.current
    detailAbort.current?.abort()
    const controller = new AbortController()
    detailAbort.current = controller
    setSelectedPlaceId(summary.placeId)
    setDetailSummary(summary)
    setDetailState({ status: 'loading' })
    const suggested = googleTypeToItineraryType(summary.primaryType)
    const categoryDefaults = googleCategory(category)
    setItemType(suggested === 'place' ? categoryDefaults.itemType : suggested)
    setDurationMinutes(categoryDefaults.durationMinutes)
    fetch(`/api/places/details/${encodeURIComponent(summary.placeId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null)
        if (sequence !== detailSequence.current) return
        if (!response.ok) { const error = parseError(body); setDetailState({ status: 'error', ...error }); return }
        const details = body as PlacesDetailsResponse
        setDetailState({ status: 'ready', place: details.place, reviewsEnabled: details.reviewsEnabled })
        const type = googleTypeToItineraryType(details.place.primaryType)
        if (type !== 'place') setItemType(type)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (sequence === detailSequence.current) setDetailState({ status: 'error', code: 'network', retryable: true })
      })
  }, [category])

  const closeDetail = useCallback(() => { detailAbort.current?.abort(); setDetailSummary(null); setDetailState(null) }, [])
  const selectMapPlace = useCallback((placeId: string) => { const place = results.find((entry) => entry.placeId === placeId); if (place) loadDetail(place) }, [results, loadDetail])
  const mapFailure = useCallback(() => setViewMode('list'), [])

  const tripDataRef = useRef(tripData)
  useEffect(() => { tripDataRef.current = tripData }, [tripData])
  const loadTripData = useCallback(async (tripId: string) => {
    setSelectedTripId(tripId)
    if (!tripId || mode === 'trip' || tripDataRef.current[tripId]) return
    const sequence = ++tripSequence.current
    setTripDataLoading(true)
    const supabase = createClient()
    const [stopsResult, itemsResult] = await Promise.all([
      supabase.from('stops').select('*').eq('trip_id', tripId).order('order_index'),
      supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('order_index'),
    ])
    if (sequence !== tripSequence.current) return
    setTripDataLoading(false)
    if (stopsResult.error || itemsResult.error) { showToast("Couldn't load this trip for duplicate checking.", 'error'); return }
    setTripData((current) => ({ ...current, [tripId]: { stops: stopsResult.data as Stop[], items: itemsResult.data as ItineraryItem[] } }))
  }, [mode])

  const currentTripData = useMemo(() => mode === 'trip' ? { stops: activeStops, items: activeItems } : tripData[selectedTripId] ?? { stops: [], items: [] }, [mode, activeStops, activeItems, tripData, selectedTripId])
  const duplicate = useMemo<DuplicateMatch | null>(() => {
    if (!addPlace) return null
    const sources: DuplicateSource[] = [
      ...currentTripData.stops.map((stop) => ({ id: stop.id, kind: 'stop' as const, provider: null, externalId: null, title: stop.name, localDate: stop.arrival_date, lat: stop.lat, lng: stop.lng })),
      ...currentTripData.items.map((item) => ({ id: item.id, kind: 'item' as const, provider: item.place_provider, externalId: item.external_place_id, title: item.title, localDate: item.local_date, lat: item.lat, lng: item.lng })),
    ]
    return findPlaceDuplicate({ provider: 'google', externalId: addPlace.placeId, title: addPlace.name, lat: addPlace.lat, lng: addPlace.lng }, sources)
  }, [addPlace, currentTripData])

  const openAddSheet = useCallback((unscheduled: boolean) => {
    if (!detailSummary) return
    const tripId = activeTrip?.id ?? trips.find((trip) => trip.role !== 'viewer')?.id ?? ''
    setSaveToUnscheduled(unscheduled)
    setAddPlace(detailSummary)
    setDetailSummary(null)
    setDetailState(null)
    if (tripId) void loadTripData(tripId)
  }, [detailSummary, activeTrip?.id, trips, loadTripData])

  const insertPlace = useCallback(async (input: AddPlaceInput) => {
    if (!addPlace || saving || !itineraryEnabled) return
    const trip = trips.find((entry) => entry.id === input.tripId)
    if (!trip || trip.role === 'viewer') return
    setSaving(true)
    const startAt = instantForDeviceZone(input.localDate, input.startTime)
    const endAt = startAt && input.durationMinutes > 0 ? new Date(Date.parse(startAt) + input.durationMinutes * 60_000).toISOString() : null
    const items = mode === 'trip' ? activeItems : tripData[input.tripId]?.items ?? []
    const orderIndex = items.filter((item) => item.local_date === input.localDate).reduce((max, item) => Math.max(max, item.order_index + 1), 0)
    const optimisticId = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: ItineraryItem = {
      id: optimisticId, trip_id: input.tripId, stop_id: null, item_type: input.itemType, title: input.title,
      notes: null, start_at: startAt, end_at: endAt, all_day: !startAt, local_date: input.localDate,
      timezone: startAt ? deviceTimezone() : null, order_index: orderIndex,
      // Provider geography stays session-only in the optimistic row. The DB insert below persists only Place ID + user planning content.
      lat: addPlace.lat, lng: addPlace.lng, address: addPlace.formattedAddress,
      place_provider: 'google', external_place_id: addPlace.placeId, normalized_address: null,
      duration_minutes: input.durationMinutes, estimated_cost: null, currency: null, status: 'planned', is_locked: false,
      created_by: currentUserId, created_at: now, updated_at: now,
    }
    if (mode === 'trip' && setActiveItems) setActiveItems((current) => current.some((item) => item.id === optimisticId) ? current : [...current, optimistic])
    const insertPayload = {
      id: optimisticId, trip_id: input.tripId, stop_id: null, item_type: input.itemType, title: input.title,
      notes: null, start_at: startAt, end_at: endAt, all_day: !startAt, local_date: input.localDate,
      timezone: startAt ? deviceTimezone() : null, order_index: orderIndex,
      lat: null, lng: null, address: null, place_provider: 'google', external_place_id: addPlace.placeId,
      normalized_address: null, duration_minutes: input.durationMinutes, status: 'planned', created_by: currentUserId,
    }
    const { data, error } = await createClient().from('itinerary_items').insert(insertPayload).select().single()
    setSaving(false)
    if (error || !data) {
      if (mode === 'trip' && setActiveItems) setActiveItems((current) => current.filter((item) => item.id !== optimisticId))
      showToast("Couldn't add this place. Your itinerary was restored.", 'error')
      return
    }
    const row = data as ItineraryItem
    if (mode === 'trip' && setActiveItems) setActiveItems((current) => current.map((item) => item.id === optimisticId ? row : item))
    else setTripData((current) => ({ ...current, [input.tripId]: { stops: current[input.tripId]?.stops ?? [], items: [...(current[input.tripId]?.items ?? []), row] } }))
    setAddPlace(null)
    const startDay = trip.startDate ? Date.parse(`${trip.startDate}T12:00:00Z`) : Number.NaN
    const selectedDay = input.localDate ? Date.parse(`${input.localDate}T12:00:00Z`) : Number.NaN
    const dayNumber = Number.isFinite(startDay) && Number.isFinite(selectedDay) ? Math.max(1, Math.round((selectedDay - startDay) / 86_400_000) + 1) : null
    const day = input.localDate ? dayNumber ? `Day ${dayNumber}` : input.localDate : 'Unscheduled'
    showToast(`Added ${input.title} to ${day}`, 'success', { label: 'View in itinerary', onClick: () => { if (mode === 'trip') onViewItinerary?.(); else router.push(`/trip/${input.tripId}/mobile?section=plan`) } })
  }, [addPlace, saving, itineraryEnabled, trips, mode, activeItems, tripData, currentUserId, setActiveItems, onViewItinerary, router])

  const effectiveCanEdit = itineraryEnabled && (mode === 'trip' ? canEdit : trips.some((trip) => trip.role !== 'viewer'))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header className="glass-standard" style={{ position: 'sticky', top: 0, zIndex: 10, margin: '0 -16px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === 'global' && <div><h1 style={{ margin: 0, fontSize: 20, color: tokens.textPrimary }}>Explore</h1><p style={{ margin: '3px 0 0', fontSize: 12, color: tokens.textMuted }}>Search real places with Google Maps</p></div>}
        <ExploreSearchInput value={query} onChange={setQuery} onCompositionChange={setComposing} />
        {mode === 'trip' && activeStops.length > 0 && <div role="group" aria-label="Search near destination" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>{activeStops.map((stop) => <FilterChip key={stop.id} selected={selectedStop?.id === stop.id} onClick={() => setSelectedStopId(stop.id)}>Near {stop.name}</FilterChip>)}</div>}
        <ExploreCategoryChips value={category} onChange={setCategory} />
      </header>

      {searchState.status === 'ready' && searchState.results.length > 0 && <div role="group" aria-label="Result view" style={{ display: 'flex', gap: 8 }}>{(['list', 'map'] as const).map((modeValue) => <button key={modeValue} type="button" aria-pressed={viewMode === modeValue} onClick={() => setViewMode(modeValue)} style={{ flex: 1, minHeight: 44, borderRadius: tokens.radius12, border: `1px solid ${viewMode === modeValue ? 'transparent' : 'rgba(255,255,255,.12)'}`, background: viewMode === modeValue ? tokens.accentCtaGradient : tokens.glassSubtleFill, color: viewMode === modeValue ? tokens.textOnAccent : tokens.textSecondary, fontFamily: 'inherit', fontWeight: 800, cursor: 'pointer' }}>{modeValue === 'list' ? 'List' : 'Map'}</button>)}</div>}

      {viewMode === 'map' && results.length > 0 ? <GoogleExploreMap results={results} selectedPlaceId={selectedPlaceId} queryKey={queryKey} onSelectPlace={selectMapPlace} onFailure={mapFailure} /> : <ExploreResultsList state={searchState} selectedPlaceId={selectedPlaceId} onSelect={loadDetail} onRetry={() => setRetryNonce((value) => value + 1)} hasProximity={!!proximity} />}

      <GooglePlaceDetailSheet summary={detailSummary} state={detailState} itemType={itemType} durationMinutes={durationMinutes} canEdit={effectiveCanEdit} onItemTypeChange={setItemType} onDurationChange={setDurationMinutes} onClose={closeDetail} onRetry={() => detailSummary && loadDetail(detailSummary)} onSave={() => openAddSheet(true)} onAdd={() => openAddSheet(false)} />
      <AddPlaceToTripSheet place={addPlace} trips={trips} lockedTripId={mode === 'trip' ? activeTrip?.id : undefined} defaultUnscheduled={saveToUnscheduled} itemType={itemType} durationMinutes={durationMinutes} duplicate={duplicate} tripDataLoading={tripDataLoading} saving={saving} onTripChange={loadTripData} onViewExisting={() => { setAddPlace(null); if (mode === 'trip') onViewItinerary?.(); else if (selectedTripId) router.push(`/trip/${selectedTripId}/mobile?section=plan`) }} onClose={() => setAddPlace(null)} onConfirm={(input) => { void insertPlace(input) }} />
    </div>
  )
}
