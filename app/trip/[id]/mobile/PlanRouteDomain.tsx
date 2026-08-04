'use client'

import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { createClient } from '@/lib/supabase/client'
import { getFullRoute, LatestRouteRequestController, type RouteLeg } from '@/lib/mapbox/directions'
import type { ItineraryItem, Trip, Stop, TripCapabilities, TripMember } from '@/types'
import { showToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getOptimizedOrder } from '@/lib/mapbox/optimize'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import { DestinationDialog } from './DestinationDialog'
import { ACCENT, ACCENT_DARK, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL } from './domain-ui'
import { DUSK } from '@/components/design/tokens'
import { totalNights } from './trip-domain-utils'
import { TripPrimaryNav, type PrimaryNavSection } from './components/TripPrimaryNav'
import { ItineraryTimeline, type ItineraryCreateRequest } from './itinerary/ItineraryTimeline'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'
import { buildTimeline } from './itinerary-projection'
import { TripMapDomain } from './TripMapDomain'
import { buildTimelineMapPoints, cleanSelectedItemId, timelineDayId, type OtherDayVisibility } from './trip-map-model'
import { OptimizePreviewSheet } from './plan/OptimizePreviewSheet'
import { SortableStopItem } from './plan/SortableStopItem'


/** Bottom-sheet snap heights, in px, resolved against the live viewport height. */
const SHEET_MIN_PX = 190
const SHEET_DEFAULT_RATIO = 0.54
const SHEET_MAX_RATIO = 0.88
/** Snap heights, collapsed → expanded. The handle cycles through them in order. */
const SNAP_LEVELS = ['min', 'mid', 'max'] as const
type SnapLevel = (typeof SNAP_LEVELS)[number]
/** Vertical travel below which a press on the handle still reads as a tap. */
const TAP_SLOP_PX = 4

export interface PlanRouteDomainProps {
  trip: Trip
  stops: Stop[]
  setStops: Dispatch<SetStateAction<Stop[]>>
  items: ItineraryItem[]
  setItems: Dispatch<SetStateAction<ItineraryItem[]>>
  itineraryEnabled: boolean
  onItemSyncPaused: (paused: boolean) => void
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

// ─── Main content ────────────────────────────────────────────────────────────

export function PlanRouteDomain({ trip, stops, setStops, items, setItems, itineraryEnabled, onItemSyncPaused, currentUserId, members, routePath, setRoutePath, routeLegs, setRouteLegs, onSelectSection, onPrefetchSection, onOpenMore, capabilities, onStopSyncPaused }: PlanRouteDomainProps) {
  const { canEdit } = capabilities
  const reducedMotion = useReducedMotionPreference()
  const distanceUnit = useDistanceUnit()
  const [activeTab, setActiveTab] = useState<'route' | 'days'>('route')
  const [itineraryCreateRequest, setItineraryCreateRequest] = useState<ItineraryCreateRequest | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [otherDays, setOtherDays] = useState<OtherDayVisibility>('hidden')
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  // Bumped by Retry so the route effect re-runs through the same stale-request
  // controller instead of calling the Directions API behind its back.
  const [routeRetryToken, setRouteRetryToken] = useState(0)
  // Optimize needs the network; assume online until the browser says otherwise.
  const [isOnline, setIsOnline] = useState(true)
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
  const [snapLevel, setSnapLevel] = useState<SnapLevel>('mid')
  const routeRequests = useRef(new LatestRouteRequestController())

  useEffect(() => {
    setNights((previous) => {
      const next = { ...previous }
      const currentIds = new Set(stops.map((stop) => stop.id))
      for (const id of Object.keys(next)) if (!currentIds.has(id)) delete next[id]
      for (const stop of stops) next[stop.id] = stop.nights ?? 1
      return next
    })
  }, [stops])

  // PlanRouteDomain stays mounted behind `display: none` while another section
  // is active (see TripMobileClient), so on first mount — unless Plan is the
  // initial section — stageRef measures 0 and the sheet would open collapsed.
  // A ResizeObserver catches the display:none → block transition (the first
  // non-zero measurement) and sets the default height then, instead of once
  // at mount time.
  const sheetInitializedRef = useRef(false)
  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const applyDefault = (height: number) => {
      if (sheetInitializedRef.current || height <= 0) return
      sheetInitializedRef.current = true
      sheetHeight.set(Math.round(height * SHEET_DEFAULT_RATIO))
    }
    applyDefault(node.clientHeight)
    const observer = new ResizeObserver(([entry]) => applyDefault(entry.contentRect.height))
    observer.observe(node)
    return () => observer.disconnect()
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

  // The handle's accessible name and aria-expanded need the snap level in React
  // state; sheetHeight itself is a MotionValue and never re-renders the tree.
  const settleTo = useCallback(
    (target: number, level: SnapLevel) => {
      setSnapLevel(level)
      animate(sheetHeight, target, reducedMotion ? { duration: 0 } : { duration: .22, ease: [0.22, 1, 0.36, 1] })
    },
    [reducedMotion, sheetHeight]
  )

  // Native Pointer Events (not Framer's onPan) so dragging works reliably with
  // mouse, touch, and pen alike, and pointer capture keeps tracking even if the
  // finger/cursor drifts outside the handle's small hit area mid-drag.
  const dragStart = useRef<{ pointerId: number; clientY: number; height: number } | null>(null)
  // A pointer drag ends with a click event too, so only a near-motionless press
  // counts as a tap; otherwise dragging would also cycle the snap level.
  const dragMoved = useRef(false)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStart.current = { pointerId: e.pointerId, clientY: e.clientY, height: sheetHeight.get() }
      dragMoved.current = false
      setIsDragging(true)
    },
    [sheetHeight]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragStart.current
      if (!drag || e.pointerId !== drag.pointerId) return
      const { min, max } = snapPoints()
      const delta = e.clientY - drag.clientY
      if (Math.abs(delta) > TAP_SLOP_PX) dragMoved.current = true
      sheetHeight.set(Math.min(max, Math.max(min, drag.height - delta)))
    },
    [sheetHeight, snapPoints]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragStart.current || e.pointerId !== dragStart.current.pointerId) return
      dragStart.current = null
      setIsDragging(false)
      const points = snapPoints()
      const current = sheetHeight.get()
      const nearest = SNAP_LEVELS.reduce((a, b) =>
        Math.abs(points[b] - current) < Math.abs(points[a] - current) ? b : a
      )
      settleTo(points[nearest], nearest)
    },
    [settleTo, sheetHeight, snapPoints]
  )

  const cycleSheetHeight = useCallback(() => {
    const points = snapPoints()
    const current = sheetHeight.get()
    const next: SnapLevel = current < (points.min + points.mid) / 2
      ? 'mid'
      : current < (points.mid + points.max) / 2 ? 'max' : 'min'
    settleTo(points[next], next)
  }, [settleTo, sheetHeight, snapPoints])

  // Keyboard activation and taps share the cycle; a pointer drag must not fire it again.
  const handleHandleClick = useCallback(() => {
    if (dragMoved.current) {
      dragMoved.current = false
      return
    }
    cycleSheetHeight()
  }, [cycleSheetHeight])

  // One debounced Directions request per actual route change. Keying on the
  // coordinate signature means renames, nights, and failed-reorder reverts to a
  // cached order never refetch; rapid drag-drops collapse into the last state,
  // and the AbortController cancels an in-flight response that became stale.
  const routeKey = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  useEffect(() => {
    if (stops.length < 2) {
      setRoutePath([])
      setRouteLegs([])
      setRouteStatus('idle')
      return
    }
    setRouteStatus('loading')
    const requests = routeRequests.current
    const controller = requests.begin()
    const timer = setTimeout(() => {
      const points = stops.map((s) => ({ lat: s.lat, lng: s.lng }))
      getFullRoute(points, { signal: controller.signal }).then((full) => {
        if (!requests.isCurrent(controller)) return
        if (!full) {
          setRouteStatus('unavailable')
          return
        }
        setRoutePath(full.route.polylinePath)
        setRouteLegs(full.legs)
        setRouteStatus('ready')
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      requests.cancel(controller)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, routeRetryToken])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

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
          showToast("Couldn't save this change. Check your connection and try again.", 'error', { label: 'Retry', onClick: () => changeNights(id, delta) })
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

  const routeLoading = routeStatus === 'loading'
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
  const stopSearchCountries = (trip.countries ?? []).flatMap((country) => country.code ? [country.code] : [])
  const stopSearchCountryLabel = stopSearchCountries.length > 0
    ? (trip.countries ?? []).filter((country) => country.code).map((country) => country.name).join(', ')
    : undefined

  const timeline = useMemo(() => buildTimeline({
    tripStartDate: trip.start_date ?? null,
    tripEndDate: trip.end_date ?? null,
    stops,
    items,
  }), [items, stops, trip.end_date, trip.start_date])

  const timelineMapPoints = useMemo(
    () => buildTimelineMapPoints(timeline.days, selectedDayId, otherDays),
    [otherDays, selectedDayId, timeline.days],
  )
  const mapPoints = useMemo(() => activeTab === 'route'
    ? stops.map((stop, index) => ({
        id: `stop:${stop.id}`, lat: stop.lat, lng: stop.lng, label: index + 1,
        title: stop.name, subtitle: stop.address ?? undefined, itemType: 'place',
        emphasis: 'strong' as const,
        role: index === 0 ? 'start' as const : index === stops.length - 1 ? 'end' as const : 'waypoint' as const,
      }))
    : timelineMapPoints.map((point) => ({ ...point, label: point.order })),
    [activeTab, stops, timelineMapPoints],
  )

  useEffect(() => {
    const validIds = [
      ...stops.map((stop) => `stop:${stop.id}`),
      ...items.map((item) => `item:${item.id}`),
    ]
    setSelectedItemId((current) => cleanSelectedItemId(current, validIds))
  }, [items, stops])

  const selectedDay = timeline.days.find((day) => timelineDayId(day) === selectedDayId)
  const routeRequestParts = Math.max(1, Math.ceil((stops.length - 1) / 24))
  const routeSummary = stops.length < 2
    ? `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`
    : routeStatus === 'unavailable'
      ? 'Route unavailable · itinerary still available'
      : routeStatus === 'loading'
        ? 'Calculating route…'
        : `${summaryDistanceText} · ${summaryDuration}${routeRequestParts > 1 ? ` · ${routeRequestParts} route parts` : ''}`

  const handleMapSelection = useCallback((id: string | null) => {
    setSelectedItemId(id)
    if (!id) return
    const point = timelineMapPoints.find((candidate) => candidate.id === id)
    if (point) setSelectedDayId(point.dayId)
    const { mid } = snapPoints()
    if (sheetHeight.get() < mid - 8) settleTo(mid, 'mid')
  }, [settleTo, sheetHeight, snapPoints, timelineMapPoints])

  return (
    <div
      className="atmosphere"
      style={{
        width: '100%',
        minHeight: '100svh',
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
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: DUSK.night }}>
          <TripMapDomain
            points={mapPoints}
            routePath={routePath}
            defaultCenter={defaultCenter}
            selectedItemId={selectedItemId}
            onSelectItem={handleMapSelection}
            onBack={() => onSelectSection('overview')}
            onListToggle={cycleSheetHeight}
            routeSummary={routeSummary}
            activeDayLabel={activeTab === 'days' && selectedDay?.dayNumber != null ? `Day ${selectedDay.dayNumber}` : undefined}
            otherDays={otherDays}
            onOtherDaysChange={setOtherDays}
            dropInId={lastAddedStopId ? `stop:${lastAddedStopId}` : null}
          />
        </div>

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
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 4px', flex: 'none' }}>
            <button
              type="button"
              aria-label={snapLevel === 'max' ? 'Collapse plan' : 'Expand plan'}
              aria-expanded={snapLevel !== 'min'}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onClick={handleHandleClick}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 72, minHeight: 44, padding: 0, border: 'none', background: 'transparent',
                cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
              }}
            >
              <span aria-hidden="true" style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.22)' }} />
            </button>
          </div>

          {/* pinned route summary — stays visible above Route/Days/Bookings so the
              user keeps context while scrolling the sheet or panning the map */}
          {stops.length > 0 && (
            <div
              aria-live="polite"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 16px 10px', flex: 'none', fontSize: 12.5, fontWeight: 700, color: DUSK.textSecondary }}
            >
              <span>{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
              {stops.length >= 2 && (
                routeLoading ? (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: DUSK.textMuted }} />
                    <span>Calculating route…</span>
                    <span aria-hidden="true" style={{ width: 96, height: 9, borderRadius: 999, background: 'rgba(255,255,255,.12)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
                  </>
                ) : routeStatus === 'unavailable' ? (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: DUSK.textMuted }} />
                    <span>Route unavailable</span>
                    <button
                      type="button"
                      onClick={() => setRouteRetryToken((token) => token + 1)}
                      style={{ minHeight: 32, padding: '4px 12px', borderRadius: 999, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', color: DUSK.textPrimary, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: DUSK.textMuted }} />
                    <span>{summaryDistanceText}</span>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: DUSK.textMuted }} />
                    <span>{summaryDuration}</span>
                  </>
                )
              )}
              {savingOrder && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.35)', color: ACCENT_LIGHT, fontSize: 12 }}>
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
          <div style={{ flex: 1, minHeight: 0, padding: '4px 20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflowY: 'auto' }}>

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
                        <div style={{ fontSize: 12, color: DUSK.textSecondary, fontWeight: 500, marginTop: 2 }}>Nights Planned</div>
                      </div>
                    </div>
                    {canEdit && isOnline && stops.length >= 2 && <button
                      type="button"
                      onClick={handleOptimize}
                      disabled={optimizing}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 999, padding: '10px 14px', flex: 'none', cursor: optimizing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: optimizing ? 0.6 : 1 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={optimizing ? { animation: 'pulseglow 1s ease-in-out infinite' } : undefined}><path d="M8 1L9.3 5.6L14 7L9.3 8.4L8 13L6.7 8.4L2 7L6.7 5.6L8 1Z" fill={ACCENT_LIGHT} /></svg>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: DUSK.textPrimary }}>{optimizing ? 'Optimizing…' : 'Optimize'}</span>
                    </button>}
                  </div>
                )}

                {stops.length === 0 ? (
                  <div style={{ width: '100%', flex: 1, minHeight: 200, border: '1.5px dashed rgba(255,255,255,.15)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(136,136,228,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(136,136,228,.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>
                    </div>
                    <div style={{ color: DUSK.textPrimary, fontWeight: 600, fontSize: 16, textAlign: 'center' }}>{canEdit ? 'Add your first destination' : 'No destinations yet'}</div>
                    <div style={{ color: DUSK.textMuted, fontWeight: 400, fontSize: 13, textAlign: 'center' }}>{canEdit ? 'Search any city or place to start your route' : 'An editor can add the first stop to this shared route.'}</div>
                    {/* No amber CTA here — the sticky "Add destination" action below
                        is this tab's single primary action. */}
                    {canEdit && emptyStateSuggestions.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                        <span style={{ fontSize: 12, color: DUSK.textMuted, fontWeight: 600 }}>Try:</span>
                        {emptyStateSuggestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => { setAddInitialQuery(q); setIsAddOpen(true) }}
                            style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: DUSK.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <DndContext
                    id="plan-stops-dnd"
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
                        <div
                          {...attributes}
                          {...listeners}
                          role="button"
                          tabIndex={0}
                          aria-pressed={selectedItemId === `stop:${stop.id}`}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest('button,input')) return
                            setSelectedItemId(`stop:${stop.id}`)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedItemId(`stop:${stop.id}`)
                            }
                          }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: isDragging ? 'rgba(255,255,255,.09)' : selectedItemId === `stop:${stop.id}` ? 'rgba(245,166,35,.16)' : stop.id === lastAddedStopId ? 'rgba(245,166,35,.14)' : 'rgba(255,255,255,.045)', border: `1px solid ${isDragging ? 'rgba(245,166,35,.4)' : selectedItemId === `stop:${stop.id}` ? 'rgba(245,166,35,.7)' : stop.id === lastAddedStopId ? 'rgba(245,166,35,.55)' : 'rgba(255,255,255,.09)'}`, transition: reducedMotion ? 'none' : 'background .22s ease, border-color .22s ease', touchAction: 'manipulation', cursor: canEdit ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}>
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
                                style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '4px 8px', fontSize: 14, fontWeight: 600, color: DUSK.textPrimary, outline: 'none', fontFamily: 'inherit' }}
                              />
                            ) : (
                              <div style={{ color: DUSK.textPrimary, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name}</div>
                            )}
                            {stop.address && (
                              <div style={{ color: DUSK.textMuted, fontSize: 12, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
                            )}
                          </div>
                          {canEdit ? <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: 4, flex: 'none' }}>
                            <button
                              aria-label={`Remove a night in ${stop.name}`}
                              onClick={() => changeNights(stop.id, -1)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: DUSK.textSecondary, background: 'none', border: 'none' }}
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
                          </div> : <span style={{ fontSize: 12, color: DUSK.textMuted, fontWeight: 600, flex: 'none' }}>{nights[stop.id] ?? 1} {(nights[stop.id] ?? 1) === 1 ? 'night' : 'nights'}</span>}
                        </div>

                        {canEdit && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '6px 4px 0' }}>
                          <button
                            onClick={() => {
                              setEditingStopId(stop.id)
                              setEditDraft(stop.name)
                            }}
                            title="Rename stop"
                            aria-label={`Rename ${stop.name}`}
                            style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: DUSK.textMuted }}
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
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: DUSK.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
                                    <path d="M2 12L6 4L9 9L11 6L14 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {formatDistanceValue(routeLegs[idx].distanceMeters, distanceUnit)}
                                </span>
                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: DUSK.textMuted, flex: 'none' }} />
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: DUSK.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>
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
                  <div style={{ color: DUSK.textMuted, fontSize: 12, fontWeight: 500 }}>or</div>
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

            {activeTab === 'days' && (
              <ItineraryTimeline
                trip={trip}
                stops={stops}
                items={items}
                setItems={setItems}
                onItemSyncPaused={onItemSyncPaused}
                canEdit={canEdit}
                currentUserId={currentUserId}
                members={members}
                itineraryEnabled={itineraryEnabled}
                createRequest={itineraryCreateRequest}
                selectedDayId={selectedDayId}
                onSelectedDayIdChange={setSelectedDayId}
                selectedItemId={selectedItemId}
                onSelectItem={setSelectedItemId}
              />
            )}
          </div>

          {/* Sticky primary action — one per tab, outside the scroll container so it
              never disappears under the list, and padded clear of the bottom nav. */}
          {canEdit && (
            <div style={{ flex: 'none', padding: '0 20px calc(90px + env(safe-area-inset-bottom, 0px))' }}>
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'route') {
                    setAddInitialQuery('')
                    setIsAddOpen(true)
                  } else {
                    setItineraryCreateRequest({ type: 'activity', nonce: Date.now() })
                  }
                }}
                style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 22px', borderRadius: 14, background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`, border: 'none', color: DUSK.onAmber, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 22px rgba(245,140,0,.3)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                {activeTab === 'route' ? 'Add destination' : 'Add activity'}
              </button>
            </div>
          )}
        </motion.div>

        {/* Keep the primary navigation independent from the draggable sheet.
            When the sheet snaps closed its overflow must not clip the nav. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4 }}>
          <TripPrimaryNav active="plan" onSelect={onSelectSection} onOpenMore={onOpenMore} onPrefetch={onPrefetchSection} />
        </div>
        </>
      </div>

      {canEdit && isAddOpen && (
        <DestinationDialog
          initialQuery={addInitialQuery}
          countryCodes={stopSearchCountries}
          countryLabel={stopSearchCountryLabel}
          onClose={() => setIsAddOpen(false)}
          onAdd={handleAddStop}
        />
      )}

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
