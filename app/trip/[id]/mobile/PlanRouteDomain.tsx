'use client'

import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { createClient } from '@/lib/supabase/client'
import { DeferredBoundary, DeferredFailure } from '@/components/ui/deferred-boundary'
import { getFullRoute, type RouteLeg } from '@/lib/mapbox/directions'
import type { Trip, Stop, TripCapabilities, TripMember } from '@/types'
import { showToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fetchWeatherForStops, type DayWeather, type WeatherKind } from '@/lib/weather/openMeteo'
import { getOptimizedOrder } from '@/lib/mapbox/optimize'
import { downloadTripIcs } from '@/lib/ics'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import { DestinationDialog } from './DestinationDialog'
import { ACCENT, ACCENT_DARK, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL } from './domain-ui'
import { computeStopSchedule, formatDateRange, formatDayChip, totalNights, tripTitle, type StopSchedule } from './trip-domain-utils'
import { TripMobileHeader } from './components/TripMobileHeader'
import { TripPrimaryNav, type PrimaryNavSection } from './components/TripPrimaryNav'
import { TripAddSheet } from './components/TripAddSheet'

function TripMapPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Loading trip map"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(120% 90% at 50% 10%, #12123a 0%, #0a0a28 55%, #06061c 100%)',
      }}
    />
  )
}


/** Bottom-sheet snap heights, in px, resolved against the live viewport height. */
const SHEET_MIN_PX = 190
const SHEET_DEFAULT_RATIO = 0.54
const SHEET_MAX_RATIO = 0.88

export interface PlanRouteDomainProps {
  trip: Trip
  stops: Stop[]
  setStops: Dispatch<SetStateAction<Stop[]>>
  currentUserId: string
  members: TripMember[]
  routePath: { lat: number; lng: number }[]
  setRoutePath: Dispatch<SetStateAction<{ lat: number; lng: number }[]>>
  routeLegs: RouteLeg[]
  setRouteLegs: Dispatch<SetStateAction<RouteLeg[]>>
  onSelectSection: (section: PrimaryNavSection) => void
  onPrefetchSection?: (section: PrimaryNavSection) => void
  onOpenMore: () => void
  capabilities: TripCapabilities
  onStopSyncPaused: (paused: boolean) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Weather ────────────────────────────────────────────────────────────────
// Live Open-Meteo forecast (see lib/weather/openMeteo). Chips only appear for
// arrival dates inside the ~16-day forecast horizon — no fake data.

function WeatherIcon({ kind, size = 18 }: { kind: WeatherKind; size?: number }) {
  const cloud = 'rgba(215,215,255,.7)'
  switch (kind) {
    case 'sunny':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.3" stroke={ACCENT_LIGHT} strokeWidth="1.6" />
          <g stroke={ACCENT_LIGHT} strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 2.5V5" />
            <path d="M12 19V21.5" />
            <path d="M4.2 4.2L6 6" />
            <path d="M18 18L19.8 19.8" />
            <path d="M2.5 12H5" />
            <path d="M19 12H21.5" />
            <path d="M4.2 19.8L6 18" />
            <path d="M18 6L19.8 4.2" />
          </g>
        </svg>
      )
    case 'partly':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="9" r="3.2" stroke={ACCENT_LIGHT} strokeWidth="1.6" />
          <path d="M7 19.5H16.3C18.4 19.5 20.1 17.8 20.1 15.7C20.1 13.7 18.6 12.1 16.7 12C16.2 9.8 14.2 8.2 11.9 8.2" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'cloudy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6.3 18H16.4C18.5 18 20.2 16.3 20.2 14.1C20.2 12.1 18.7 10.5 16.8 10.3C16.4 7.6 14.1 5.5 11.2 5.5C8 5.5 5.4 8.1 5.4 11.3C5.4 11.5 5.4 11.7 5.44 11.9C3.7 12.3 2.4 13.9 2.4 15.6C2.4 16.9 3.4 18 6.3 18Z" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rainy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6.3 15H16.4C18.5 15 20.2 13.3 20.2 11.1C20.2 9.1 18.7 7.5 16.8 7.3C16.4 4.6 14.1 2.5 11.2 2.5C8 2.5 5.4 5.1 5.4 8.3C5.4 8.5 5.4 8.7 5.44 8.9C3.7 9.3 2.4 10.9 2.4 12.6C2.4 13.9 3.4 15 6.3 15Z" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <g stroke="#7ec8ff" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8.2 18.3L7.2 20.8" />
            <path d="M12.5 18.3L11.5 20.8" />
            <path d="M16.8 18.3L15.8 20.8" />
          </g>
        </svg>
      )
    case 'snowy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6.3 15H16.4C18.5 15 20.2 13.3 20.2 11.1C20.2 9.1 18.7 7.5 16.8 7.3C16.4 4.6 14.1 2.5 11.2 2.5C8 2.5 5.4 5.1 5.4 8.3C5.4 8.5 5.4 8.7 5.44 8.9C3.7 9.3 2.4 10.9 2.4 12.6C2.4 13.9 3.4 15 6.3 15Z" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <g stroke="#bfe3ff" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 17.8v3M6.8 19.3h2.4" />
            <path d="M14.5 17.8v3M13.3 19.3h2.4" />
          </g>
        </svg>
      )
  }
}

// ─── Prep / packing list ────────────────────────────────────────────────────
// Backed by the `packing_items` table (migration 010). A vibe-aware starter
// template seeds the list on first open.

// ─── Main content ────────────────────────────────────────────────────────────

export function PlanRouteDomain({ trip, stops, setStops, currentUserId, members, routePath, setRoutePath, routeLegs, setRouteLegs, onSelectSection, onPrefetchSection, onOpenMore, capabilities, onStopSyncPaused }: PlanRouteDomainProps) {
  const { canEdit } = capabilities
  const router = useRouter()
  const distanceUnit = useDistanceUnit()
  const [activeTab, setActiveTab] = useState<'route' | 'days'>('route')
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [MapComponent, setMapComponent] = useState<typeof import('@/components/map/mapbox/TripboxMap').TripboxMap | null>(null)
  const [mapLoadFailed, setMapLoadFailed] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addInitialQuery, setAddInitialQuery] = useState('')
  const [aiHint, setAiHint] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [nights, setNights] = useState<Record<string, number>>(() =>
    Object.fromEntries(stops.map((s) => [s.id, s.nights ?? 1]))
  )
  const [optimizing, setOptimizing] = useState(false)
  const [optimizePreview, setOptimizePreview] = useState<{
    order: number[]
    savedDistanceMeters: number
    savedDurationSeconds: number
  } | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const sheetHeight = useMotionValue(420)

  useEffect(() => {
    let current = true
    setMapLoadFailed(false)
    import('@/components/map/mapbox/TripboxMap')
      .then((module) => { if (current) setMapComponent(() => module.TripboxMap) })
      .catch(() => { if (current) setMapLoadFailed(true) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    setNights((previous) => {
      const next = { ...previous }
      const currentIds = new Set(stops.map((stop) => stop.id))
      for (const id of Object.keys(next)) if (!currentIds.has(id)) delete next[id]
      for (const stop of stops) next[stop.id] = stop.nights ?? 1
      return next
    })
  }, [stops])

  useEffect(() => {
    const h = stageRef.current?.clientHeight ?? window.innerHeight
    sheetHeight.set(Math.round(h * SHEET_DEFAULT_RATIO))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snapPoints = useCallback(() => {
    const h = stageRef.current?.clientHeight ?? window.innerHeight
    return {
      min: SHEET_MIN_PX,
      mid: Math.round(h * SHEET_DEFAULT_RATIO),
      max: Math.round(h * SHEET_MAX_RATIO),
    }
  }, [])

  // Native Pointer Events (not Framer's onPan) so dragging works reliably with
  // mouse, touch, and pen alike, and pointer capture keeps tracking even if the
  // finger/cursor drifts outside the handle's small hit area mid-drag.
  const dragStart = useRef<{ pointerId: number; clientY: number; height: number } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStart.current = { pointerId: e.pointerId, clientY: e.clientY, height: sheetHeight.get() }
      setIsDragging(true)
    },
    [sheetHeight]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStart.current
      if (!drag || e.pointerId !== drag.pointerId) return
      const { min, max } = snapPoints()
      const next = drag.height - (e.clientY - drag.clientY)
      sheetHeight.set(Math.min(max, Math.max(min, next)))
    },
    [sheetHeight, snapPoints]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current || e.pointerId !== dragStart.current.pointerId) return
      dragStart.current = null
      setIsDragging(false)
      const { min, mid, max } = snapPoints()
      const current = sheetHeight.get()
      const nearest = [min, mid, max].reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a))
      animate(sheetHeight, nearest, { type: 'spring', stiffness: 320, damping: 34 })
    },
    [sheetHeight, snapPoints]
  )

  // One debounced Directions request per actual route change. Keying on the
  // coordinate signature means renames, nights, and failed-reorder reverts to a
  // cached order never refetch; rapid drag-drops collapse into the last state,
  // and the AbortController cancels an in-flight response that became stale.
  const routeKey = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  useEffect(() => {
    if (stops.length < 2) {
      setRoutePath([])
      setRouteLegs([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const points = stops.map((s) => ({ lat: s.lat, lng: s.lng }))
      getFullRoute(points, { signal: controller.signal }).then((full) => {
        if (controller.signal.aborted || !full) return
        setRoutePath(full.route.polylinePath)
        setRouteLegs(full.legs)
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Just-added stop: its marker drops in on the map and its list card glows
  // briefly; cleared after the highlight has had time to register.
  const [lastAddedStopId, setLastAddedStopId] = useState<string | null>(null)
  useEffect(() => {
    if (!lastAddedStopId) return
    const t = setTimeout(() => setLastAddedStopId(null), 2600)
    return () => clearTimeout(t)
  }, [lastAddedStopId])

  // Route duration total before an add, so the post-add toast can report the
  // delta ("Route updated · 18 min added") once Directions responds.
  const routeTotalRef = useRef(0)
  const pendingAddTotalRef = useRef<number | null>(null)
  useEffect(() => {
    const total = routeLegs.reduce((s, l) => s + l.durationSeconds, 0)
    const prev = pendingAddTotalRef.current
    if (prev != null && routeLegs.length > 0) {
      pendingAddTotalRef.current = null
      const deltaMin = Math.round((total - prev) / 60)
      if (deltaMin >= 1) {
        const text = deltaMin >= 60 ? `${Math.floor(deltaMin / 60)}h ${deltaMin % 60}m` : `${deltaMin} min`
        showToast(`Route updated · ${text} added`, 'success')
      } else {
        showToast('Route updated', 'success')
      }
    }
    routeTotalRef.current = total
  }, [routeLegs])

  // Optimistic update; reverts to the previous value if the write fails.
  const changeNights = (id: string, delta: number) => {
    if (!canEdit) return
    const current = nights[id] ?? 1
    const next = Math.max(1, current + delta)
    if (next === current) return
    setNights((prev) => ({ ...prev, [id]: next }))
    setStops((prev) => prev.map((stop) => stop.id === id ? { ...stop, nights: next } : stop))
    const supabase = createClient()
    supabase
      .from('stops')
      .update({ nights: next })
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          setNights((prev) => ({ ...prev, [id]: current }))
          setStops((prev) => prev.map((stop) => stop.id === id && stop.nights === next ? { ...stop, nights: current } : stop))
          showToast("Couldn't save nights. Run migration 008 if you haven't yet.", 'error', { label: 'Retry', onClick: () => changeNights(id, delta) })
        }
      })
  }

  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deleteStopTarget, setDeleteStopTarget] = useState<Stop | null>(null)

  useEffect(() => {
    if (editingStopId && !stops.some((stop) => stop.id === editingStopId)) setEditingStopId(null)
    if (deleteStopTarget && !stops.some((stop) => stop.id === deleteStopTarget.id)) setDeleteStopTarget(null)
  }, [deleteStopTarget, editingStopId, stops])

  const handleDeleteStop = useCallback(async (id: string) => {
    if (!canEdit) return
    const supabase = createClient()
    const { error } = await supabase.from('stops').delete().eq('id', id)
    if (!error) setStops((prev) => prev.filter((s) => s.id !== id))
    else showToast("Couldn't delete the stop. Please try again.", 'error')
  }, [canEdit, setStops])

  const handleRenameStop = useCallback(async (id: string, name: string) => {
    if (!canEdit) return
    const trimmed = name.trim()
    if (!trimmed) return
    const supabase = createClient()
    const { error } = await supabase.from('stops').update({ name: trimmed }).eq('id', id)
    if (!error) setStops((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)))
    else showToast("Couldn't rename the stop.", 'error')
  }, [canEdit, setStops])

  // Drag-and-drop reordering (dnd-kit). Pointer needs a small movement and touch
  // a long-press before a drag starts, so taps on the buttons inside each card
  // (nights stepper, rename) keep working as plain clicks.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  )

  const [savingOrder, setSavingOrder] = useState(false)

  // Shows the new order immediately, then persists the whole order in a single
  // atomic RPC (migration 014). On failure the previous order comes back (so a
  // refresh never shows a different route) and the error toast offers a retry.
  const applyStopOrder = (next: Stop[], previous: Stop[]) => {
    if (!canEdit) return
    onStopSyncPaused(true)
    setStops(next.map((stop, order_index) => ({ ...stop, order_index })))
    setSavingOrder(true)
    const supabase = createClient()
    supabase
      .rpc('reorder_trip_stops', { p_trip_id: trip.id, p_stop_ids: next.map((s) => s.id) })
      .then(({ error }) => {
        setSavingOrder(false)
        if (error) {
          setStops(previous)
          showToast("Couldn't save the new stop order — reverted.", 'error', { label: 'Retry', onClick: () => applyStopOrder(next, previous) })
        }
        onStopSyncPaused(false)
      })
  }

  // Mapbox Optimization API — keeps first/last stops fixed, reorders the middle.
  // Fetches the candidate order + its totals first and shows a before/after
  // comparison sheet; stops only actually move once the user taps Apply.
  const handleOptimize = async () => {
    if (!canEdit || optimizing) return
    if (stops.length < 3) { showToast('Add at least 3 stops to optimize the order.', 'info'); return }
    if (stops.length > 12) { showToast('Optimization works with up to 12 stops.', 'info'); return }
    setOptimizing(true)
    const result = await getOptimizedOrder(stops.map((s) => ({ lat: s.lat, lng: s.lng })))
    setOptimizing(false)
    if (!result) { showToast("Couldn't optimize the route. Please try again.", 'error'); return }
    const { order, distanceMeters: optimizedDistance, durationSeconds: optimizedDuration } = result
    if (order.every((v, i) => v === i)) { showToast('Your route is already optimal! 🎉', 'success'); return }
    const currentDistance = routeLegs.reduce((s, l) => s + l.distanceMeters, 0)
    const currentDuration = routeLegs.reduce((s, l) => s + l.durationSeconds, 0)
    setOptimizePreview({
      order,
      savedDistanceMeters: currentDistance - optimizedDistance,
      savedDurationSeconds: currentDuration - optimizedDuration,
    })
  }

  const applyOptimizePreview = () => {
    if (!canEdit || !optimizePreview) return
    applyStopOrder(optimizePreview.order.map((i) => stops[i]), stops)
    showToast('Route optimized — stops reordered.', 'success')
    setOptimizePreview(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canEdit) {
      onStopSyncPaused(false)
      return
    }
    const { active, over } = event
    if (!over || active.id === over.id) {
      onStopSyncPaused(false)
      return
    }
    const oldIndex = stops.findIndex((s) => s.id === active.id)
    const newIndex = stops.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    applyStopOrder(arrayMove(stops, oldIndex, newIndex), stops)
  }

  const handleAddStop = useCallback(
    async (lat: number, lng: number, name: string, address: string) => {
      if (!canEdit) return
      const attempt = async () => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('stops')
          .insert({
            trip_id: trip.id,
            name,
            lat,
            lng,
            address,
            order_index: stops.length,
            stop_type: stops.length === 0 ? 'origin' : 'destination',
            created_by: currentUserId,
          })
          .select()
          .single()
        if (!error && data) {
          pendingAddTotalRef.current = routeTotalRef.current
          setStops((prev) => {
            const row = data as Stop
            return prev.some((stop) => stop.id === row.id)
              ? prev.map((stop) => stop.id === row.id ? row : stop)
              : [...prev, row]
          })
          setLastAddedStopId((data as Stop).id)
        } else showToast("Couldn't add the destination.", 'error', { label: 'Retry', onClick: () => { void attempt() } })
      }
      await attempt()
    },
    [trip.id, stops.length, currentUserId, canEdit, setStops]
  )

  const stopSchedule = computeStopSchedule(trip.start_date, stops, nights)
  const routeLoading = stops.length >= 2 && routeLegs.length === 0
  const summaryDistanceText = formatDistanceValue(routeLegs.reduce((sum, l) => sum + l.distanceMeters, 0), distanceUnit)
  const summaryMin = Math.round(routeLegs.reduce((sum, l) => sum + l.durationSeconds, 0) / 60)
  const summaryDuration = `${Math.floor(summaryMin / 60)}h ${String(summaryMin % 60).padStart(2, '0')}m`
  const nightsTotal = totalNights(trip)
  const nightsPlanned = stops.reduce((sum, s) => sum + (nights[s.id] ?? 1), 0)
  const nightsTarget = nightsTotal || nightsPlanned || 1
  const ringCircumference = 150.8
  const ringPct = Math.min(1, nightsPlanned / nightsTarget)
  const ringOffset = ringCircumference * (1 - ringPct)
  const defaultCenter =
    trip.focus_lat != null && trip.focus_lng != null ? { lat: trip.focus_lat, lng: trip.focus_lng } : undefined
  // Example searches for the empty state: the wizard's destination countries
  // when available, otherwise a generic starter set.
  const emptyStateSuggestions = (trip.countries?.length ? trip.countries.map((c) => c.name) : ['Rome', 'Barcelona', 'Tokyo']).slice(0, 3)

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100svh',
        background: 'linear-gradient(145deg, #06061c, #0a1020, #071216)',
        fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
        position: 'relative',
        overflow: 'clip',
      }}
    >
      <style>{`
        @keyframes dashmove { to { stroke-dashoffset: -40; } }
        @keyframes pulseglow { 0%,100% { opacity: .45; } 50% { opacity: .8; } }
        * { scrollbar-width: none }
        *::-webkit-scrollbar { display: none }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      {/* luminous orbs */}
      <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, borderRadius: '50%', background: 'rgba(245,140,0,.22)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 160, left: -100, width: 340, height: 340, borderRadius: '50%', background: 'rgba(90,0,210,.20)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 220, right: -120, width: 320, height: 320, borderRadius: '50%', background: 'rgba(0,100,160,.14)', filter: 'blur(70px)', pointerEvents: 'none' }} />

      <div ref={stageRef} style={{ position: 'relative', zIndex: 1, height: '100svh', maxWidth: 480, margin: '0 auto', overflow: 'hidden' }}>
        <>
        {/* map layer — fixed, full-bleed, never resized or re-rendered by the sheet drag.
            The sheet is a pure overlay on top; it covers more/less of this static map as it moves,
            but the map's own DOM container size (and therefore its camera) never changes. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#06061c' }}>
          <DeferredBoundary label="the trip map" style={{ position: 'absolute', inset: 0 }}>
            {mapLoadFailed ? (
              <DeferredFailure label="the trip map" onRetry={() => window.location.reload()} style={{ position: 'absolute', inset: 0 }} />
            ) : MapComponent ? (
                <MapComponent
                  points={stops.map((s, idx) => ({ id: s.id, lat: s.lat, lng: s.lng, label: idx + 1, title: s.name, subtitle: s.address ?? undefined }))}
                  routePath={routePath}
                  defaultCenter={defaultCenter}
                  defaultZoom={5}
                  dropInId={lastAddedStopId}
                />
            ) : <TripMapPlaceholder />}
          </DeferredBoundary>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, transparent 78%, rgba(6,6,28,.6) 100%)' }} />
        </div>

        <TripMobileHeader
          variant="overlay"
          title={tripTitle(trip, stops)}
          subtitle={formatDateRange(trip.start_date, trip.end_date) || 'No dates set'}
          readOnly={!canEdit}
          members={members}
          tripId={trip.id}
          onBack={() => router.push('/trips')}
          onOpenMore={onOpenMore}
          backLabel="Back to trips"
        />

        {/* draggable bottom sheet */}
        <motion.div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
            height: sheetHeight,
            background: 'rgba(10,10,26,.82)', border: `1px solid ${GLASS_BORDER}`, borderBottom: 'none',
            backdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0',
            boxShadow: '0 -12px 40px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 12px', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', flex: 'none' }}
          >
            <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.22)' }} />
          </div>

          {/* pinned route summary — stays visible above Route/Days/Bookings so the
              user keeps context while scrolling the sheet or panning the map */}
          {stops.length > 0 && (
            <div
              aria-live="polite"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 16px 10px', flex: 'none', fontSize: 12.5, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}
            >
              <span>{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
              {stops.length >= 2 && (
                routeLoading ? (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)' }} />
                    <span aria-hidden="true" style={{ width: 96, height: 9, borderRadius: 999, background: 'rgba(255,255,255,.12)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)' }} />
                    <span>{summaryDistanceText}</span>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)' }} />
                    <span>{summaryDuration}</span>
                  </>
                )
              )}
              {savingOrder && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.35)', color: ACCENT_LIGHT, fontSize: 11 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_LIGHT, animation: 'pulseglow 1s ease-in-out infinite' }} />
                  Saving route…
                </span>
              )}
            </div>
          )}

          {/* tabs — inline segmented pill control (Route/Days/Bookings) */}
          <div style={{ padding: '0 16px 12px', flex: 'none' }}>
            <SegmentedTabs
              options={[
                { value: 'route', label: 'Route' },
                { value: 'days', label: 'Days' },
              ]}
              value={activeTab}
              onValueChange={setActiveTab}
            />
          </div>

          {/* content */}
          <div style={{ flex: 1, padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflowY: 'auto' }}>

            {activeTab === 'route' && (
              <>
                {stops.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 22, padding: '18px 20px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <svg width="56" height="56" viewBox="0 0 56 56" style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
                        <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke="url(#tripper-ring-grad)" strokeWidth="5" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} />
                        <defs>
                          <linearGradient id="tripper-ring-grad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={ACCENT_LIGHT} />
                            <stop offset="100%" stopColor={ACCENT} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{nightsPlanned} / {nightsTarget}</div>
                        <div style={{ fontSize: 12, color: 'rgba(215,215,255,.7)', fontWeight: 500, marginTop: 2 }}>Nights Planned</div>
                      </div>
                    </div>
                    {canEdit && <button
                      onClick={handleOptimize}
                      disabled={optimizing}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 999, padding: '10px 14px', flex: 'none', cursor: optimizing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: optimizing ? 0.6 : 1 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={optimizing ? { animation: 'pulseglow 1s ease-in-out infinite' } : undefined}><path d="M8 1L9.3 5.6L14 7L9.3 8.4L8 13L6.7 8.4L2 7L6.7 5.6L8 1Z" fill={ACCENT_LIGHT} /></svg>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{optimizing ? 'Optimizing…' : 'Optimize'}</span>
                    </button>}
                  </div>
                )}

                {stops.length === 0 ? (
                  <div style={{ width: '100%', flex: 1, minHeight: 200, border: '1.5px dashed rgba(255,255,255,.15)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(136,136,228,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(136,136,228,.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 16, textAlign: 'center' }}>{canEdit ? 'Add your first destination' : 'No destinations yet'}</div>
                    <div style={{ color: 'rgba(215,215,255,.55)', fontWeight: 400, fontSize: 13, textAlign: 'center' }}>{canEdit ? 'Search any city or place to start your route' : 'An editor can add the first stop to this shared route.'}</div>
                    {canEdit && <button
                      onClick={() => { setAddInitialQuery(''); setIsAddOpen(true) }}
                      style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, padding: '12px 22px', borderRadius: 13, background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`, border: 'none', color: '#1a0800', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 22px rgba(245,140,0,.3)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      Add your first stop
                    </button>}
                    {canEdit && emptyStateSuggestions.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                        <span style={{ fontSize: 11.5, color: 'rgba(215,215,255,.45)', fontWeight: 600 }}>Try:</span>
                        {emptyStateSuggestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => { setAddInitialQuery(q); setIsAddOpen(true) }}
                            style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(215,215,255,.8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragStart={() => onStopSyncPaused(true)}
                    onDragCancel={() => onStopSyncPaused(false)}
                    onDragEnd={handleDragEnd}
                  >
                  <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    {stops.map((stop, idx) => (
                      <SortableStopItem key={stop.id} id={stop.id} disabled={!canEdit}>
                        {({ attributes, listeners, isDragging }) => (
                          <>
                        <div {...attributes} {...listeners} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: isDragging ? 'rgba(255,255,255,.09)' : stop.id === lastAddedStopId ? 'rgba(245,166,35,.14)' : 'rgba(255,255,255,.045)', border: `1px solid ${isDragging ? 'rgba(245,166,35,.4)' : stop.id === lastAddedStopId ? 'rgba(245,166,35,.55)' : 'rgba(255,255,255,.09)'}`, transition: 'background .7s ease, border-color .7s ease', touchAction: 'manipulation', cursor: canEdit ? (isDragging ? 'grabbing' : 'grab') : 'default' }}>
                          {canEdit && <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flex: 'none', opacity: 0.45 }} aria-hidden="true">
                            <circle cx="2" cy="2" r="1.2" fill="#d7d7ff" /><circle cx="6" cy="2" r="1.2" fill="#d7d7ff" />
                            <circle cx="2" cy="7" r="1.2" fill="#d7d7ff" /><circle cx="6" cy="7" r="1.2" fill="#d7d7ff" />
                            <circle cx="2" cy="12" r="1.2" fill="#d7d7ff" /><circle cx="6" cy="12" r="1.2" fill="#d7d7ff" />
                          </svg>}
                          <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ACCENT }}>
                            {idx + 1}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {editingStopId === stop.id ? (
                              <input
                                autoFocus
                                aria-label={`Rename ${stop.name}`}
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRenameStop(stop.id, editDraft)
                                    setEditingStopId(null)
                                  } else if (e.key === 'Escape') {
                                    setEditingStopId(null)
                                  }
                                }}
                                onBlur={() => {
                                  handleRenameStop(stop.id, editDraft)
                                  setEditingStopId(null)
                                }}
                                style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '4px 8px', fontSize: 14, fontWeight: 600, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                              />
                            ) : (
                              <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name}</div>
                            )}
                            {stop.address && (
                              <div style={{ color: 'rgba(215,215,255,.55)', fontSize: 11.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
                            )}
                          </div>
                          {canEdit ? <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: 4, flex: 'none' }}>
                            <button
                              aria-label={`Remove a night in ${stop.name}`}
                              onClick={() => changeNights(stop.id, -1)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(215,215,255,.8)', background: 'none', border: 'none' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 700, width: 20, textAlign: 'center' }}>{nights[stop.id] ?? 1}</span>
                            <button
                              aria-label={`Add a night in ${stop.name}`}
                              onClick={() => changeNights(stop.id, 1)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: ACCENT_LIGHT, background: 'none', border: 'none' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                          </div> : <span style={{ fontSize: 12, color: 'rgba(215,215,255,.58)', fontWeight: 600, flex: 'none' }}>{nights[stop.id] ?? 1} {(nights[stop.id] ?? 1) === 1 ? 'night' : 'nights'}</span>}
                        </div>

                        {canEdit && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '6px 4px 0' }}>
                          <button
                            onClick={() => {
                              setEditingStopId(stop.id)
                              setEditDraft(stop.name)
                            }}
                            title="Rename stop"
                            aria-label={`Rename ${stop.name}`}
                            style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(215,215,255,.6)' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          </button>
                          <button
                            onClick={() => setDeleteStopTarget(stop)}
                            title="Delete stop"
                            aria-label={`Delete ${stop.name}`}
                            style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: '#f87171' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>
                          </button>
                        </div>}

                        {idx < stops.length - 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 10px 32px' }}>
                            <div style={{ position: 'relative', width: 2, height: 28, background: 'repeating-linear-gradient(to bottom, rgba(245,140,0,.5) 0 4px, transparent 4px 8px)' }}>
                              <div style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, margin: -4, borderRadius: '50%', background: ACCENT_LIGHT, boxShadow: '0 0 14px 3px rgba(245,140,0,.6)', animation: 'pulseglow 2.2s ease-in-out infinite' }} />
                            </div>
                            {routeLegs[idx] ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(215,215,255,.55)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
                                    <path d="M2 12L6 4L9 9L11 6L14 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {formatDistanceValue(routeLegs[idx].distanceMeters, distanceUnit)}
                                </span>
                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)', flex: 'none' }} />
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(215,215,255,.55)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
                                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
                                    <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {routeLegs[idx].durationText}
                                </span>
                              </div>
                            ) : (
                              <span aria-hidden="true" style={{ width: 92, height: 10, borderRadius: 999, background: 'rgba(255,255,255,.1)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
                            )}
                          </div>
                        )}
                          </>
                        )}
                      </SortableStopItem>
                    ))}
                  </div>
                  </SortableContext>
                  </DndContext>
                )}

                {canEdit && <><div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                  <div style={{ color: 'rgba(215,215,255,.55)', fontSize: 12, fontWeight: 500 }}>or</div>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                </div>

                <button
                  onClick={() => setAiHint(true)}
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: GLASS_FILL, border: '1px solid rgba(245,166,35,.35)', boxShadow: '0 0 20px rgba(245,140,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 14 }}>✨</span>
                  <span style={{ color: '#f5c268', fontWeight: 700, fontSize: 14 }}>{aiHint ? 'Coming soon' : 'Generate trip with AI'}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,166,35,.15)', border: '1px solid rgba(245,166,35,.35)', color: ACCENT_LIGHT, letterSpacing: '.05em' }}>SOON</span>
                </button></>}
              </>
            )}

            {activeTab === 'days' && <DaysTab stops={stops} routeLegs={routeLegs} schedule={stopSchedule} tripName={tripTitle(trip, stops)} />}
          </div>

          <TripPrimaryNav active="plan" onSelect={onSelectSection} onOpenMore={onOpenMore} onPrefetch={onPrefetchSection} />
        </motion.div>
        </>
      </div>

      {/* FAB */}
      {canEdit && <button
          onClick={() => setIsAddSheetOpen(true)}
          title="Add to trip"
          aria-label="Add to trip"
          style={{ position: 'fixed', right: 18, bottom: 96, width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`, boxShadow: '0 0 32px rgba(245,140,0,.45), 0 8px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, border: 'none', cursor: 'pointer' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>}

      {canEdit && <TripAddSheet
        open={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
        onAddPlace={() => { setAddInitialQuery(''); setIsAddOpen(true) }}
      />}

      {canEdit && isAddOpen && <DestinationDialog initialQuery={addInitialQuery} onClose={() => setIsAddOpen(false)} onAdd={handleAddStop} />}

      {canEdit && <OptimizePreviewSheet preview={optimizePreview} onApply={applyOptimizePreview} onDismiss={() => setOptimizePreview(null)} />}

      {canEdit && <ConfirmDialog
        open={deleteStopTarget !== null}
        title="Delete this stop?"
        message={deleteStopTarget ? `"${deleteStopTarget.name}" will be removed from your route. This can't be undone.` : ''}
        onConfirm={() => {
          if (deleteStopTarget) handleDeleteStop(deleteStopTarget.id)
          setDeleteStopTarget(null)
        }}
        onCancel={() => setDeleteStopTarget(null)}
      />}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

/** Before/after comparison shown after "Optimize" — stops only reorder once the user taps Apply. */
function OptimizePreviewSheet({
  preview, onApply, onDismiss,
}: {
  preview: { savedDistanceMeters: number; savedDurationSeconds: number } | null
  onApply: () => void
  onDismiss: () => void
}) {
  const distanceUnit = useDistanceUnit()
  const dismissRef = useRef<HTMLButtonElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)
  const distanceText = preview ? formatDistanceValue(Math.abs(preview.savedDistanceMeters), distanceUnit) : ''
  const min = preview ? Math.round(Math.abs(preview.savedDurationSeconds) / 60) : 0
  const improved = (preview?.savedDistanceMeters ?? 0) > 0 || (preview?.savedDurationSeconds ?? 0) > 0

  useEffect(() => {
    if (!preview) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => dismissRef.current?.focus())
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const target = document.activeElement === dismissRef.current && !e.shiftKey ? applyRef.current : dismissRef.current
        target?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [preview, onDismiss])

  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,.6)', padding: 24,
            fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="optimize-preview-title"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, borderRadius: 20, padding: 20,
              background: 'rgba(14,14,34,.97)', border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 16px 48px rgba(0,0,0,.5)', backdropFilter: 'blur(24px)',
            }}
          >
            <div id="optimize-preview-title" style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
              Optimized route
            </div>
            <div style={{ fontSize: 13, color: 'rgba(215,215,255,.65)', marginTop: 6, lineHeight: 1.5 }}>
              {improved
                ? "Reordering your middle stops shortens the drive. Apply to update your route."
                : "This order doesn't save distance or time, but you can still apply it if you prefer the sequence."}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <div style={{ flex: 1, borderRadius: 14, padding: '12px 14px', background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>
                  {improved ? '−' : ''}{distanceText}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(215,215,255,.55)', marginTop: 2 }}>distance</div>
              </div>
              <div style={{ flex: 1, borderRadius: 14, padding: '12px 14px', background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>
                  {improved ? '−' : ''}{min} min
                </div>
                <div style={{ fontSize: 11, color: 'rgba(215,215,255,.55)', marginTop: 2 }}>drive time</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                ref={dismissRef}
                onClick={onDismiss}
                style={{
                  flex: 1, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.85)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Keep current
              </button>
              <button
                ref={applyRef}
                onClick={onApply}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`,
                  border: 'none', color: '#1a1004', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(245,166,35,.3)',
                }}
              >
                Apply
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** dnd-kit wrapper: applies the sort transform and hands drag props to the card. */
function SortableStopItem({ id, disabled, children }: {
  id: string
  disabled: boolean
  children: (p: { attributes: React.HTMLAttributes<HTMLDivElement>; listeners: Record<string, unknown> | undefined; isDragging: boolean }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div ref={setNodeRef} style={{ transform: DndCSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}>
      {children({ attributes: disabled ? {} : attributes as React.HTMLAttributes<HTMLDivElement>, listeners: disabled ? undefined : listeners as Record<string, unknown> | undefined, isDragging })}
    </div>
  )
}

function DaysTab({ stops, routeLegs, schedule, tripName }: { stops: Stop[]; routeLegs: RouteLeg[]; schedule: StopSchedule[]; tripName: string }) {
  const distanceUnit = useDistanceUnit()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [weather, setWeather] = useState<Record<string, DayWeather | null>>({})

  // Refetch only when a stop or its arrival date actually changes.
  const weatherKey = stops.map((s, i) => `${s.id}:${schedule[i]?.arrival ?? ''}`).join('|')
  useEffect(() => {
    if (!stops.length) return
    let cancelled = false
    fetchWeatherForStops(
      stops.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, date: schedule[i]?.arrival ?? null }))
    ).then((w) => {
      if (!cancelled) setWeather(w)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherKey])

  if (stops.length === 0) return <ComingSoon label="Day-by-day planning" />

  const exportIcs = () => {
    const events = stops
      .map((s, i) => ({ name: s.name, address: s.address, arrival: schedule[i]?.arrival, departure: schedule[i]?.departure }))
      .filter((e): e is { name: string; address: string | null; arrival: string; departure: string } => !!(e.arrival && e.departure))
    if (!events.length) {
      showToast('Set trip dates first to export the calendar.', 'info')
      return
    }
    downloadTripIcs(tripName, events)
    showToast('Calendar file downloaded.', 'success')
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {schedule[0]?.arrival && (
        <button
          onClick={exportIcs}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 16px', borderRadius: 14, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
            <path d="M8 2.5v4M16 2.5v4M3 9.5h18M12 13v5M9.5 15.5h5" />
          </svg>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Add to calendar (.ics)</span>
        </button>
      )}
      {stops.map((stop, idx) => {
        const isOpen = !!expanded[stop.id]
        const sched = schedule[idx]
        const dayLabel = sched
          ? sched.dayStart === sched.dayEnd
            ? `Day ${sched.dayStart}`
            : `Days ${sched.dayStart}–${sched.dayEnd}`
          : `Day ${idx + 1}`
        const dateChip = sched?.arrival ? formatDayChip(sched.arrival) : null
        const hasDetail = !!(stop.notes || stop.address)
        const prevStop = idx > 0 ? stops[idx - 1] : null
        const leg = idx > 0 ? routeLegs[idx - 1] : null
        const w = weather[stop.id]
        return (
          <div key={stop.id}>
            {prevStop && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', padding: 12, background: 'rgba(0,0,0,.18)', borderRadius: 14 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}>{prevStop.name}</div>
                </div>
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: 2, background: 'linear-gradient(to right, transparent, #8888e4, transparent)' }} />
                  <div style={{ fontSize: 10.5, color: 'rgba(215,215,255,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {leg
                      ? `${leg.durationText} · ${formatDistanceValue(leg.distanceMeters, distanceUnit)}`
                      : <span aria-hidden="true" style={{ display: 'inline-block', width: 64, height: 8, borderRadius: 999, background: 'rgba(255,255,255,.12)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}>{stop.name}</div>
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={!hasDetail}
              onClick={() => hasDetail && setExpanded((e) => ({ ...e, [stop.id]: !e[stop.id] }))}
              aria-expanded={hasDetail ? isOpen : undefined}
              style={{
                width: '100%', textAlign: 'left', color: 'inherit', fontFamily: 'inherit',
                background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20,
                padding: 16, cursor: hasDetail ? 'pointer' : 'default', backdropFilter: 'blur(20px)',
                boxShadow: '0 6px 20px rgba(0,0,0,.2)',
              }}
            >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(215,215,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {dayLabel}{dateChip ? ` · ${dateChip}` : ''}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stop.name}
                </div>
                {prevStop && <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT_LIGHT, marginTop: 3 }}>Travel Day</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                {w && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <WeatherIcon kind={w.kind} />
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>
                      {w.high}° <span style={{ color: 'rgba(215,215,255,.5)', fontWeight: 600 }}>/ {w.low}°</span>
                    </div>
                  </div>
                )}
                {hasDetail && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stop.address && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(215,215,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Address</div>
                    <div style={{ fontSize: 13, color: 'rgba(215,215,255,.88)', lineHeight: 1.5 }}>{stop.address}</div>
                  </div>
                )}
                {stop.notes && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(215,215,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Notes</div>
                    <div style={{ fontSize: 13, color: 'rgba(215,215,255,.88)', lineHeight: 1.5 }}>{stop.notes}</div>
                  </div>
                )}
              </div>
            )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '40px 16px', textAlign: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'rgba(215,215,255,.55)', fontSize: 12.5 }}>Coming soon</span>
    </div>
  )
}

