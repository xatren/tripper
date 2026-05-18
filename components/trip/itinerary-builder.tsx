'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarDays,
  ChevronDown,
  Compass,
  BedDouble,
  Map as MapIcon,
  PlayCircle,
  Search,
  Moon,
  Minus,
  Plus,
  ListChecks,
  LayoutList,
  DollarSign,
  CheckSquare,
  FileText,
  UserPlus,
  Settings as SettingsIcon,
  ArrowLeft,
  MapPin,
  Loader2,
  Pencil,
  Trash2,
  Star,
  MoreHorizontal,
  Navigation,
  SlidersHorizontal,
  Clock,
  Car,
  GripVertical,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Stop, Trip, RouteSegment, HotelResult, ActivityResult } from '@/types'
import { segmentKey } from '@/types'
import { LodgingDialog, type LodgingFormData } from '@/components/trip/lodging-dialog'
import { SleepView } from '@/components/trip/sleep-view'
import { ActivityView } from '@/components/trip/activity-view'
import { createClient } from '@/lib/supabase/client'

interface ItineraryBuilderProps {
  trip: Trip
  stops: Stop[]
  nightsByStop: Record<string, number>
  onChangeNights: (stopId: string, nights: number) => void
  onPlaceSelected: (lat: number, lng: number, name: string, address: string) => void
  onSelectStop: (id: string | null) => void
  selectedStopId: string | null
  onOpenSettings: () => void
  onOpenCollaborators: () => void
  onDeleteStop?: (stopId: string) => void
  onReorderStops?: (stops: Stop[]) => void
  isOwner: boolean
  mapSlot: React.ReactNode
  routeSegments?: Map<string, RouteSegment>
  tripId: string
  currentUserId: string
  onHotelsChanged: (hotels: HotelResult[]) => void
  onActivitiesChanged: (activities: ActivityResult[]) => void
}

type MainTab = 'itinerary' | 'lists'
type SubTab = 'route' | 'day' | 'summary'

/** Straight-line km fallback while directions API loads */
function haversineKm(a: Stop, b: Stop): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

/** Format Google Maps duration string into a short label, e.g. "2h 15min" */
function shortDuration(text: string): string {
  return text
    .replace(' hours', 'h')
    .replace(' hour', 'h')
    .replace(' mins', 'min')
    .replace(' min', 'min')
    .replace('  ', ' ')
    .trim()
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatHeaderRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  const sStr = s.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
  const eStr = e.toLocaleDateString('en-US', { day: '2-digit', month: 'long' })
  return `${sStr} – ${eStr}`
}

function totalNightsAvailable(trip: Trip): number {
  if (!trip.start_date || !trip.end_date) return 0
  const s = new Date(trip.start_date)
  const e = new Date(trip.end_date)
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

export function ItineraryBuilder({
  trip,
  stops,
  nightsByStop,
  onChangeNights,
  onPlaceSelected,
  onSelectStop,
  selectedStopId,
  onOpenSettings,
  onOpenCollaborators,
  onDeleteStop,
  onReorderStops,
  isOwner,
  mapSlot,
  routeSegments,
  tripId,
  currentUserId,
  onHotelsChanged,
  onActivitiesChanged,
}: ItineraryBuilderProps) {
  const router = useRouter()
  const [activeView, setActiveView] = useState<'itinerary' | 'sleep' | 'activity'>('itinerary')
  const [sleepInitialStopId, setSleepInitialStopId] = useState<string | null>(null)
  const [activityInitialStopId, setActivityInitialStopId] = useState<string | null>(null)
  const [mainTab, setMainTab] = useState<MainTab>('itinerary')
  const [subTab, setSubTab] = useState<SubTab>('route')
  const [lodgingStopId, setLodgingStopId] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(480)
  const isResizing = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // ── dnd-kit sensors ──────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
    setOpenMenuId(null)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = stops.findIndex((s) => s.id === active.id)
    const newIdx = stops.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorderStops?.(arrayMove(stops, oldIdx, newIdx))
  }, [stops, onReorderStops])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const delta = ev.clientX - dragStartX.current
      const next = Math.min(820, Math.max(320, dragStartWidth.current + delta))
      setPanelWidth(next)
    }
    const onMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [panelWidth])

  const handleSaveLodging = useCallback(async (data: LodgingFormData) => {
    const supabase = createClient()
    const description = `${data.hotelName}${data.location ? ` — ${data.location}` : ''} · ${data.nights} night${data.nights !== 1 ? 's' : ''}`
    const { error } = await supabase.from('expenses').insert({
      trip_id: tripId,
      stop_id: lodgingStopId,
      category: 'lodging',
      amount: data.totalCost,
      description,
      paid_by: currentUserId,
    })
    if (error) throw error
  }, [lodgingStopId, tripId, currentUserId])

  const totalNights = totalNightsAvailable(trip)
  const plannedNights = useMemo(
    () => stops.reduce((s, st) => s + (nightsByStop[st.id] ?? 1), 0),
    [stops, nightsByStop]
  )

  const stopDates = useMemo(() => {
    const map = new Map<string, { start: Date; end: Date }>()
    if (!trip.start_date) return map
    let cursor = new Date(trip.start_date)
    for (const stop of stops) {
      const nights = Math.max(0, nightsByStop[stop.id] ?? 1)
      const start = new Date(cursor)
      const end = new Date(cursor)
      end.setDate(end.getDate() + nights)
      map.set(stop.id, { start, end })
      cursor = end
    }
    return map
  }, [stops, nightsByStop, trip.start_date])

  return (
    <div className="flex h-screen w-full bg-background text-foreground">

      {/* ── Thin icon sidebar ─────────────────────────────── */}
      <aside className="flex w-14 flex-shrink-0 flex-col items-center justify-between border-r border-border/40 bg-card py-4">
        <div className="flex flex-col items-center gap-0.5">
          {/* Back */}
          <button
            onClick={() => { router.push('/dashboard'); router.refresh() }}
            className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Itinerary */}
          <SidebarIcon
            icon={<LayoutList className="h-4 w-4" />}
            active={activeView === 'itinerary'}
            label="Itinerary"
            onClick={() => setActiveView('itinerary')}
          />

          {/* Sleep / Hotel search */}
          <SidebarIcon
            icon={<BedDouble className="h-4 w-4" />}
            active={activeView === 'sleep'}
            label="Sleep"
            onClick={() => setActiveView(activeView === 'sleep' ? 'itinerary' : 'sleep')}
          />

          {/* Explore / Activities */}
          <SidebarIcon
            icon={<Compass className="h-4 w-4" />}
            active={activeView === 'activity'}
            label="Explore"
            onClick={() => setActiveView(activeView === 'activity' ? 'itinerary' : 'activity')}
          />

          {/* Coming soon */}
          <SidebarIcon icon={<DollarSign className="h-4 w-4" />} label="Budget" disabled />
          <SidebarIcon icon={<CheckSquare className="h-4 w-4" />} label="Lists" disabled />
          <SidebarIcon icon={<FileText className="h-4 w-4" />} label="Notes" disabled />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={onOpenCollaborators}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
            title="Copy invite code"
          >
            <UserPlus className="h-4 w-4" />
          </button>
          {isOwner && (
            <button
              onClick={onOpenSettings}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              title="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* ── Planning pane / Sleep view ─────────────────────── */}
      <section
        className="flex flex-shrink-0 flex-col overflow-hidden bg-card/50"
        style={{ width: panelWidth }}
      >
        {activeView === 'sleep' && (
          <SleepView
            key={sleepInitialStopId ?? 'sleep-view'}
            trip={trip}
            stops={stops}
            initialStopId={sleepInitialStopId ?? selectedStopId}
            tripId={tripId}
            currentUserId={currentUserId}
            onBack={() => setActiveView('itinerary')}
            onHotelsChanged={onHotelsChanged}
          />
        )}
        {activeView === 'activity' && (
          <ActivityView
            key={activityInitialStopId ?? 'activity-view'}
            trip={trip}
            stops={stops}
            initialStopId={activityInitialStopId ?? selectedStopId}
            tripId={tripId}
            currentUserId={currentUserId}
            onBack={() => setActiveView('itinerary')}
            onActivitiesChanged={onActivitiesChanged}
          />
        )}
        {activeView === 'itinerary' && (<>
        {/* Header */}
        <div className="border-b border-border/40 bg-card/90 px-5 pb-3.5 pt-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            {/* Left: title + date */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold text-foreground">{trip.title}</h1>
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold bg-primary/20 text-primary ring-1 ring-primary/30">
                  E
                </span>
                <button
                  onClick={onOpenCollaborators}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
                  title="Invite"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                {formatHeaderRange(trip.start_date, trip.end_date) || 'Set trip dates in settings'}
                {stops.length > 0 && (
                  <span className="ml-2 text-muted-foreground/50">· {stops.length} stop{stops.length !== 1 ? 's' : ''}</span>
                )}
              </p>
            </div>

            {/* Right: budget + nights */}
            <div className="flex flex-shrink-0 items-center gap-4">
              <div className="text-right">
                <div className="text-base font-bold text-foreground">
                  ${(trip.total_budget ?? 0).toFixed(2)}
                </div>
                <div className="flex items-center justify-end gap-0.5 text-[10px] text-muted-foreground/70">
                  USD <ChevronDown className="h-2.5 w-2.5" />
                </div>
              </div>
              <NightsCircle planned={plannedNights} total={totalNights} />
            </div>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex border-b border-border/40 bg-card/70 px-5">
          <TabButton active={mainTab === 'itinerary'} onClick={() => setMainTab('itinerary')}>
            Itinerary
          </TabButton>
          <TabButton active={mainTab === 'lists'} onClick={() => setMainTab('lists')}>
            Lists
          </TabButton>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center justify-between border-b border-border/40 bg-card/50 px-5 py-2">
          <div className="flex items-center gap-1">
            <SubTabButton active={subTab === 'route'} onClick={() => setSubTab('route')} icon={<MapIcon className="h-3.5 w-3.5" />}>
              Route
            </SubTabButton>
            <SubTabButton active={subTab === 'day'} onClick={() => setSubTab('day')} icon={<CheckSquare className="h-3.5 w-3.5" />}>
              Day by day
            </SubTabButton>
            <SubTabButton active={subTab === 'summary'} onClick={() => setSubTab('summary')} icon={<PlayCircle className="h-3.5 w-3.5" />}>
              Summary
            </SubTabButton>
          </div>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
              showNotes ? 'text-primary' : 'text-muted-foreground/60 hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Notes
          </button>
        </div>

        {/* Column headers — route view only */}
        {subTab === 'route' && (
          <div className="grid grid-cols-[20px_1.8fr_0.75fr_0.6fr_0.6fr_32px] items-center gap-2 border-b border-border/30 bg-muted/20 px-5 py-2">
            <div />
            {[
              { icon: <MapIcon className="h-3 w-3" />, label: 'Destination' },
              { icon: <Moon className="h-3 w-3" />, label: 'Nights' },
              { icon: <BedDouble className="h-3 w-3" />, label: 'Sleep' },
              { icon: <Compass className="h-3 w-3" />, label: 'Activity' },
              { icon: null, label: '' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {icon}
                {label}
              </div>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Day by day view ── */}
          {subTab === 'day' && (
            <DayByDayView
              stops={stops}
              nightsByStop={nightsByStop}
              startDate={trip.start_date}
              routeSegments={routeSegments}
            />
          )}

          {/* ── Route view ── */}
          {subTab === 'route' && (stops.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <MapIcon className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No destinations yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Click on the map or search below to add stops.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="py-3">
                  {stops.map((stop, idx) => (
                    <SortableStopRow
                      key={stop.id}
                      stop={stop}
                      idx={idx}
                      stops={stops}
                      stopDates={stopDates}
                      nightsByStop={nightsByStop}
                      selectedStopId={selectedStopId}
                      openMenuId={openMenuId}
                      showNotes={showNotes}
                      routeSegments={routeSegments}
                      onSelectStop={onSelectStop}
                      onChangeNights={onChangeNights}
                      onDeleteStop={onDeleteStop}
                      onOpenMenu={setOpenMenuId}
                      onOpenLodging={(stopId) => {
                        setSleepInitialStopId(stopId)
                        setActiveView('sleep')
                      }}
                      onOpenActivity={(stopId) => {
                        setActivityInitialStopId(stopId)
                        setActiveView('activity')
                      }}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* Ghost card while dragging */}
              <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                {activeDragId ? (() => {
                  const s = stops.find((x) => x.id === activeDragId)
                  if (!s) return null
                  return (
                    <div className="mx-4 rounded-xl border border-primary/40 bg-card shadow-2xl shadow-primary/20 ring-2 ring-primary/25 opacity-95">
                      <div className="grid grid-cols-[20px_1.8fr_0.75fr_0.6fr_0.6fr_32px] items-center gap-2 px-4 py-3">
                        <GripVertical className="h-4 w-4 text-primary/50" />
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                            {stops.findIndex((x) => x.id === activeDragId) + 1}
                          </span>
                          <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                        </div>
                      </div>
                    </div>
                  )
                })() : null}
              </DragOverlay>
            </DndContext>
          ))}

          {mainTab === 'lists' && (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              <ListChecks className="mb-2 h-5 w-5 opacity-40" />
              Lists view — coming soon.
            </div>
          )}

        </div>

        {/* ── Sticky search bar ─────────────────────────────── */}
        <div className="border-t border-border/40 bg-card/95 backdrop-blur-md">
          <SidebarSearch onPlaceSelected={onPlaceSelected} />
        </div>
        </>)}
      </section>

      {/* ── Resize handle ─────────────────────────────────── */}
      <div
        onMouseDown={handleResizeStart}
        className="group relative flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center bg-border/30 transition-colors hover:bg-primary/40"
      >
        <div className="h-10 w-0.5 rounded-full bg-border/60 transition-colors group-hover:bg-primary" />
      </div>

      {/* ── Map pane ──────────────────────────────────────── */}
      <section className="relative min-w-0 flex-1 bg-background">
        {mapSlot}
        <MapOverlayControls />
      </section>

      <LodgingDialog
        open={lodgingStopId !== null}
        stopName={stops.find((s) => s.id === lodgingStopId)?.name}
        onClose={() => setLodgingStopId(null)}
        onSave={handleSaveLodging}
      />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────────── */

function SidebarIcon({
  icon, label, active, disabled, onClick,
}: {
  icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick?: () => void
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-primary/20 text-primary'
          : disabled
          ? 'cursor-default text-muted-foreground/30'
          : 'text-muted-foreground/60 hover:bg-secondary hover:text-foreground'
      }`}
    >
      {icon}
    </button>
  )
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
        active ? 'text-primary' : 'text-muted-foreground/60 hover:text-foreground'
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
    </button>
  )
}

function SubTabButton({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-secondary text-primary shadow-sm ring-1 ring-border/50'
          : 'text-muted-foreground/60 hover:bg-secondary/60 hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function IconAddButton({
  variant, title, onClick,
}: {
  variant: 'primary' | 'accent' | 'green'
  title: string
  onClick?: () => void
}) {
  const cls =
    variant === 'green'
      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 ring-emerald-500/30'
      : variant === 'primary'
      ? 'bg-primary/20 text-primary hover:bg-primary/30 ring-primary/30'
      : 'bg-accent/20 text-accent hover:bg-accent/30 ring-accent/30'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full ring-1 transition-colors ${cls}`}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  )
}

function NightsCircle({ planned, total }: { planned: number; total: number }) {
  const size = 48
  const stroke = 3.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const safeTotal = Math.max(total, 1)
  const progress = Math.min(planned / safeTotal, 1)
  const dash = c * progress

  return (
    <div className="flex items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
          {planned}/{total || '–'}
        </div>
      </div>
      <div className="text-[10px] leading-tight text-muted-foreground/70">
        Nights<br />planned
      </div>
    </div>
  )
}

/* ── Sortable stop row ────────────────────────────────────── */

interface SortableStopRowProps {
  stop: Stop
  idx: number
  stops: Stop[]
  stopDates: Map<string, { start: Date; end: Date }>
  nightsByStop: Record<string, number>
  selectedStopId: string | null
  openMenuId: string | null
  showNotes: boolean
  routeSegments?: Map<string, RouteSegment>
  onSelectStop: (id: string | null) => void
  onChangeNights: (stopId: string, nights: number) => void
  onDeleteStop?: (stopId: string) => void
  onOpenMenu: (id: string | null) => void
  onOpenLodging: (stopId: string) => void
  onOpenActivity: (stopId: string) => void
}

function SortableStopRow({
  stop, idx, stops, stopDates, nightsByStop, selectedStopId,
  openMenuId, showNotes, routeSegments,
  onSelectStop, onChangeNights, onDeleteStop, onOpenMenu, onOpenLodging, onOpenActivity,
}: SortableStopRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  const next = stops[idx + 1]
  const segKey = next ? segmentKey(stop.lat, stop.lng, next.lat, next.lng) : null
  const routeSeg = segKey ? routeSegments?.get(segKey) : null
  const fallbackKm = next ? haversineKm(stop, next) : null
  const dates = stopDates.get(stop.id)
  const nights = nightsByStop[stop.id] ?? 1
  const isSelected = selectedStopId === stop.id

  return (
    <div ref={setNodeRef} style={style} className={`group/row ${isDragging ? 'opacity-40' : ''}`}>
      {/* Backdrop to close menu */}
      {openMenuId === stop.id && (
        <div className="fixed inset-0 z-20" onClick={() => onOpenMenu(null)} />
      )}

      {/* ── Stop card ── */}
      <div
        className={`mx-4 cursor-pointer rounded-xl border transition-all duration-150 ${
          isSelected
            ? 'border-primary/40 bg-primary/8 shadow-md shadow-primary/10 ring-1 ring-primary/20'
            : 'border-border/40 bg-card/70 hover:border-border/70 hover:bg-card hover:shadow-sm'
        }`}
        onClick={() => onSelectStop(stop.id)}
      >
        <div className="grid grid-cols-[20px_1.8fr_0.75fr_0.6fr_0.6fr_32px] items-center gap-2 px-4 py-3">

          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab touch-none text-muted-foreground/25 transition-colors hover:text-muted-foreground/60 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Destination */}
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'border border-primary/50 bg-card text-primary'
              }`}
            >
              {idx + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{stop.name}</div>
              {dates && (
                <div className="truncate text-[10px] text-muted-foreground/70">
                  {formatShortDate(dates.start)} – {formatShortDate(dates.end)}
                </div>
              )}
              {showNotes && stop.notes && (
                <div className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground/60">
                  {stop.notes}
                </div>
              )}
            </div>
          </div>

          {/* Nights — compact stepper */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onChangeNights(stop.id, Math.max(0, nights - 1))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[18px] text-center text-sm font-semibold text-foreground">
              {nights}
            </span>
            <button
              onClick={() => onChangeNights(stop.id, nights + 1)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Sleeping — green */}
          <div onClick={(e) => e.stopPropagation()}>
            <IconAddButton
              variant="green"
              title="Add lodging"
              onClick={() => onOpenLodging(stop.id)}
            />
          </div>

          {/* Activities */}
          <div onClick={(e) => e.stopPropagation()}>
            <IconAddButton
              variant="accent"
              title="Explore activities"
              onClick={() => onOpenActivity(stop.id)}
            />
          </div>

          {/* ⋯ menu */}
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <button
                onClick={() => onOpenMenu(openMenuId === stop.id ? null : stop.id)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover/row:opacity-100"
                title="More options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {openMenuId === stop.id && (
                <div className="absolute right-0 top-7 z-30 min-w-[148px] rounded-xl border border-border/60 bg-card p-1 shadow-2xl">
                  <button
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                    onClick={() => { onSelectStop(stop.id); onOpenMenu(null) }}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    Edit
                  </button>
                  <button
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                    onClick={() => onOpenMenu(null)}
                  >
                    <Star className="h-3.5 w-3.5 text-muted-foreground" />
                    Favorite
                  </button>
                  <div className="my-1 border-t border-border/40" />
                  <button
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                    onClick={() => { onDeleteStop?.(stop.id); onOpenMenu(null) }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Transport connector ── */}
      {fallbackKm !== null && (
        <div className="flex items-center gap-2 px-8 py-1">
          <div className="flex flex-col items-center gap-[3px]">
            <div className="h-1.5 w-px rounded-full bg-border/40" />
            <div className="h-1 w-px rounded-full bg-border/25" />
            <div className="h-1 w-px rounded-full bg-border/15" />
          </div>

          {routeSeg ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/20">
                <Navigation className="h-3 w-3" />
                {shortDuration(routeSeg.durationText)}
              </div>
              <span className="text-[10px] text-muted-foreground/50">{routeSeg.distanceText}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground/60 ring-1 ring-border/20">
                <Navigation className="h-3 w-3 animate-pulse" />
                ~{fallbackKm} km
              </div>
            </div>
          )}

          <div className="flex-1 border-t border-dashed border-border/15" />
        </div>
      )}
    </div>
  )
}

function MapOverlayControls() {
  const [tripRoute, setTripRoute] = useState(true)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
      {/* Unified glass control bar */}
      <div className="pointer-events-auto flex items-center divide-x divide-border/40 rounded-full bg-card/90 shadow-lg ring-1 ring-border/50 backdrop-blur-md">
        {/* Trip route toggle */}
        <button
          onClick={() => setTripRoute((v) => !v)}
          className="flex items-center gap-2 rounded-l-full px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
        >
          Trip route
          <span
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              tripRoute ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                tripRoute ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>

        <FilterPill label="List" />
        <FilterPill label="Category" />

        {/* Last pill gets rounded-r */}
        <FilterPill label="Status" last />
      </div>
    </div>
  )
}

function FilterPill({ label, last }: { label: string; last?: boolean }) {
  return (
    <button
      className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 ${
        last ? 'rounded-r-full' : ''
      }`}
    >
      {label}
      <ChevronDown className="h-3 w-3 text-muted-foreground/70" />
    </button>
  )
}

function SidebarSearch({
  onPlaceSelected,
}: {
  onPlaceSelected: (lat: number, lng: number, name: string, address: string) => void
}) {
  const map = useMap()
  const placesLib = useMapsLibrary('places')
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (placesLib && map) {
      autocompleteRef.current = new placesLib.AutocompleteService()
      placesServiceRef.current = new placesLib.PlacesService(map)
    }
  }, [placesLib, map])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q || !autocompleteRef.current) {
      setPredictions([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(() => {
      autocompleteRef.current!.getPlacePredictions(
        { input: q, types: ['establishment', 'geocode'] },
        (results) => {
          setPredictions(results ?? [])
          setIsSearching(false)
        }
      )
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleSelect = useCallback((prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesServiceRef.current) return
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['name', 'geometry', 'formatted_address'] },
      (result) => {
        if (!result?.geometry?.location) return
        const lat = result.geometry.location.lat()
        const lng = result.geometry.location.lng()
        map?.panTo({ lat, lng })
        map?.setZoom(14)
        onPlaceSelected(
          lat, lng,
          result.name || prediction.structured_formatting?.main_text || '',
          result.formatted_address || prediction.description
        )
        setQuery('')
        setPredictions([])
        setShowSuggestions(false)
      }
    )
  }, [map, onPlaceSelected])

  return (
    <div className="relative px-4 py-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder="Add new destination…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          className="rounded-xl border-border/50 bg-muted/40 pl-9 pr-8 placeholder:text-muted-foreground/50 focus:bg-card"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground/50" />
        )}
      </div>
      {showSuggestions && predictions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 z-20 mb-2 rounded-xl border border-border/50 bg-card p-1.5 shadow-2xl">
          {predictions.slice(0, 6).map((prediction) => (
            <button
              key={prediction.place_id}
              className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(prediction) }}
            >
              <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {prediction.structured_formatting?.main_text ?? prediction.description}
                </p>
                <p className="truncate text-xs text-muted-foreground/60">
                  {prediction.structured_formatting?.secondary_text ?? ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   DAY BY DAY VIEW  (timeline redesign)
══════════════════════════════════════════════════════════════ */

interface WeatherData {
  temp: number
  code: number
}

/** WMO weather code → emoji + short label */
function wmoInfo(code: number): { emoji: string; label: string } {
  if (code === 0)  return { emoji: '☀️', label: 'Clear' }
  if (code <= 2)   return { emoji: '🌤️', label: 'Mostly clear' }
  if (code === 3)  return { emoji: '☁️', label: 'Overcast' }
  if (code <= 48)  return { emoji: '🌫️', label: 'Foggy' }
  if (code <= 55)  return { emoji: '🌦️', label: 'Drizzle' }
  if (code <= 65)  return { emoji: '🌧️', label: 'Rainy' }
  if (code <= 77)  return { emoji: '🌨️', label: 'Snowy' }
  if (code <= 82)  return { emoji: '🌦️', label: 'Showers' }
  if (code <= 86)  return { emoji: '❄️', label: 'Snow showers' }
  return           { emoji: '⛈️', label: 'Thunderstorm' }
}

function SummaryPill({
  icon, value, label,
}: {
  icon: React.ReactNode; value: string; label: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/60 px-3 py-2">
      <div className="text-primary/70">{icon}</div>
      <div>
        <div className="text-sm font-bold text-foreground leading-tight">{value}</div>
        <div className="text-[10px] text-muted-foreground/60 leading-tight">{label}</div>
      </div>
    </div>
  )
}

function CityWeatherBlock({
  name, weather, align = 'left',
}: {
  name: string; weather: WeatherData | undefined; align?: 'left' | 'right'
}) {
  const info = weather ? wmoInfo(weather.code) : null
  return (
    <div className={`flex flex-col gap-0.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="max-w-[96px] truncate text-xs font-semibold text-foreground leading-tight">{name}</span>
      {info ? (
        <span className="flex items-center gap-1 text-[11px]">
          <span>{info.emoji}</span>
          <span className="font-semibold text-sky-300">{weather!.temp}°C</span>
        </span>
      ) : (
        <span className="h-4 w-12 animate-pulse rounded bg-muted/40" />
      )}
    </div>
  )
}

function DayByDayView({
  stops,
  nightsByStop,
  startDate,
  routeSegments,
}: {
  stops: Stop[]
  nightsByStop: Record<string, number>
  startDate?: string | null
  routeSegments?: Map<string, RouteSegment>
}) {
  const [weather, setWeather] = useState<Map<string, WeatherData>>(new Map())

  /** Fetch current weather for every unique stop location */
  useEffect(() => {
    const seen = new Set<string>()
    stops.forEach((stop) => {
      const key = `${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`
      if (seen.has(key) || weather.has(key)) return
      seen.add(key)
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${stop.lat}&longitude=${stop.lng}&current=temperature_2m,weather_code&timezone=auto`
      )
        .then((r) => r.json())
        .then((data) => {
          if (!data?.current) return
          setWeather((prev) =>
            new Map(prev).set(key, {
              temp: Math.round(data.current.temperature_2m),
              code: data.current.weather_code,
            })
          )
        })
        .catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops])

  /** Compute per-stop date ranges */
  const stopDatesMap = useMemo(() => {
    const map = new Map<string, { arrival: Date; departure: Date; firstDay: number }>()
    if (stops.length === 0) return map
    let dayNum = 1
    const cursor = startDate ? new Date(startDate) : new Date()
    stops.forEach((stop) => {
      const nights = nightsByStop[stop.id] ?? 1
      const arrival = new Date(cursor)
      const departure = new Date(cursor)
      departure.setDate(departure.getDate() + nights)
      map.set(stop.id, { arrival, departure, firstDay: dayNum })
      dayNum += nights
      cursor.setDate(cursor.getDate() + nights)
    })
    return map
  }, [stops, nightsByStop, startDate])

  /** Summary stats */
  const totalDays = useMemo(
    () => stops.reduce((s, st) => s + (nightsByStop[st.id] ?? 1), 0),
    [stops, nightsByStop]
  )

  const { totalDriveSeconds, totalDistanceMeters } = useMemo(() => {
    let secs = 0; let meters = 0
    stops.forEach((stop, idx) => {
      if (idx >= stops.length - 1) return
      const next = stops[idx + 1]
      const seg = routeSegments?.get(segmentKey(stop.lat, stop.lng, next.lat, next.lng))
      if (seg) { secs += seg.durationSeconds; meters += seg.distanceMeters }
    })
    return { totalDriveSeconds: secs, totalDistanceMeters: meters }
  }, [stops, routeSegments])

  const totalDriveLabel = useMemo(() => {
    if (totalDriveSeconds <= 0) return '–'
    const h = Math.floor(totalDriveSeconds / 3600)
    const m = Math.floor((totalDriveSeconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }, [totalDriveSeconds])

  const totalKm = totalDistanceMeters > 0 ? Math.round(totalDistanceMeters / 1000) : 0

  if (stops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
          <CalendarDays className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No destinations yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Add stops to see your day-by-day plan.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">

      {/* ── Summary stats bar ──────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 border-b border-border/30 bg-muted/20 px-4 py-3">
        <SummaryPill icon={<CalendarDays className="h-4 w-4" />} value={String(totalDays)} label="Total days" />
        <SummaryPill icon={<MapPin className="h-4 w-4" />} value={String(stops.length)} label="Stops" />
        <SummaryPill icon={<Car className="h-4 w-4" />} value={totalDriveLabel} label="Drive time" />
        <SummaryPill icon={<Navigation className="h-4 w-4" />} value={totalKm > 0 ? `${totalKm} km` : '–'} label="Distance" />
      </div>

      {/* ── Timeline ───────────────────────────────────────── */}
      <div className="relative px-4 py-4">
        {/* Vertical line behind dots */}
        <div className="absolute bottom-4 left-[36px] top-4 w-px bg-border/30" />

        <div className="flex flex-col gap-3">
          {stops.map((stop, idx) => {
            const stopKey = `${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`
            const stopW = weather.get(stopKey)
            const nights = nightsByStop[stop.id] ?? 1
            const dates = stopDatesMap.get(stop.id)

            // Travel segment from previous stop
            const prevStop = idx > 0 ? stops[idx - 1] : null
            const routeSeg = prevStop
              ? routeSegments?.get(segmentKey(prevStop.lat, prevStop.lng, stop.lat, stop.lng))
              : undefined
            const prevKey = prevStop ? `${prevStop.lat.toFixed(4)},${prevStop.lng.toFixed(4)}` : null
            const prevW = prevKey ? weather.get(prevKey) : undefined

            const arrivalStr = dates
              ? dates.arrival.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null
            const departureStr = dates
              ? dates.departure.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null

            return (
              <div key={stop.id} className="flex flex-col gap-2">

                {/* ── Travel card (all stops except the first) ── */}
                {prevStop && (
                  <div className="relative flex items-center gap-3">
                    {/* Car dot */}
                    <div className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-amber-500/50 bg-amber-500/10 shadow-sm">
                      <Car className="h-4 w-4 text-amber-400" />
                    </div>

                    {/* Travel route card */}
                    <div className="flex flex-1 min-w-0 items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                      <CityWeatherBlock name={prevStop.name} weather={prevW} />

                      {/* Route connector */}
                      <div className="flex flex-1 flex-col items-center gap-0.5 min-w-0">
                        <div className="flex w-full items-center gap-1">
                          <div className="h-px flex-1 bg-amber-500/25" />
                          <div className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/25 whitespace-nowrap">
                            <Car className="h-3 w-3" />
                            {routeSeg
                              ? shortDuration(routeSeg.durationText)
                              : <span className="animate-pulse text-amber-400/50">···</span>}
                          </div>
                          <div className="h-px flex-1 bg-amber-500/25" />
                        </div>
                        {routeSeg && (
                          <span className="text-[10px] text-muted-foreground/50">{routeSeg.distanceText}</span>
                        )}
                      </div>

                      <CityWeatherBlock name={stop.name} weather={stopW} align="right" />
                    </div>
                  </div>
                )}

                {/* ── Stay card ── */}
                <div className="relative flex items-start gap-3">
                  {/* Numbered dot */}
                  <div className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-teal-500/50 bg-teal-500/10 shadow-sm">
                    <span className="text-xs font-bold text-teal-400">{idx + 1}</span>
                  </div>

                  {/* Stay details card */}
                  <div className="flex flex-1 min-w-0 gap-3 rounded-xl border border-teal-500/20 bg-teal-500/5 p-3">

                    {/* Weather — big display */}
                    <div className="flex flex-col items-center justify-center rounded-lg border border-border/30 bg-card/50 px-3 py-2 min-w-[64px]">
                      {stopW ? (() => {
                        const info = wmoInfo(stopW.code)
                        return (
                          <>
                            <span className="text-2xl leading-none">{info.emoji}</span>
                            <span className="mt-1 text-base font-bold text-sky-300 leading-none">{stopW.temp}°C</span>
                            <span className="mt-0.5 text-[9px] text-muted-foreground/50 text-center leading-tight">{info.label}</span>
                          </>
                        )
                      })() : (
                        <div className="flex flex-col items-center gap-1">
                          <div className="h-6 w-6 animate-pulse rounded-full bg-muted/40" />
                          <div className="h-3 w-8 animate-pulse rounded bg-muted/30" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-foreground">{stop.name}</div>
                          {stop.address && (
                            <div className="truncate text-[10px] text-muted-foreground/50 mt-0.5">{stop.address}</div>
                          )}
                        </div>
                        {/* Day badge */}
                        {dates && (
                          <span className="flex-shrink-0 rounded-md bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-400">
                            Day {dates.firstDay}{nights > 1 ? `–${dates.firstDay + nights - 1}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Nights + date range */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 text-[11px] text-teal-400/80">
                          <Moon className="h-3 w-3" />
                          <span>{nights} night{nights !== 1 ? 's' : ''}</span>
                        </div>
                        {arrivalStr && departureStr && (
                          <span className="text-[10px] text-muted-foreground/50">
                            {arrivalStr} – {departureStr}
                          </span>
                        )}
                        {stop.notes && (
                          <span className="text-[10px] text-muted-foreground/50 italic line-clamp-1">
                            {stop.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
