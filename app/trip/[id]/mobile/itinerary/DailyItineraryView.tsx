'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Moon, Plus } from 'lucide-react'
import { getFullRoute, LatestRouteRequestController } from '@/lib/mapbox/directions'
import type { TimelineDay, TimelineEntry } from '../itinerary-projection'
import type { TripLifecycle } from '../trip-lifecycle'
import { adjacentDailyDayId, dailyDayId, dailyRouteMode, dailyRouteTitle, mappedDailyEntries } from './daily-itinerary'
import styles from './DailyItinerary.module.css'

const TripboxMap = dynamic(
  () => import('@/components/map/mapbox/TripboxMap').then((module) => module.TripboxMap),
  { ssr: false, loading: () => <div role="status" aria-label="Loading route map" style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#11102a,#24173b)', animation: 'pulseglow 1.8s ease-in-out infinite' }} /> },
)

interface DailyItineraryViewProps {
  days: TimelineDay[]
  day: TimelineDay
  selectedDayId: string
  /**
   * Stop the traveler sleeps at on this day, or null on the return day and on
   * any day no stay covers. On nights 2…N of a stay this is the only place that
   * says it — the stop projection itself only lands on the arrival day.
   */
  overnightBase?: string | null
  lifecycle: TripLifecycle
  today: string
  canEdit: boolean
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  onSelectDay: (id: string) => void
  onBack: () => void
  onAdd: () => void
  onOpenMap: () => void
  children: ReactNode
  afterRoute?: ReactNode
}

function fullDate(dateISO: string | null): string {
  if (!dateISO) return 'Date not set'
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${dateISO}T12:00:00`))
}

function DailyRoutePreview({ day, isToday, selectedItemId, onSelectItem, onOpenMap }: {
  day: TimelineDay
  isToday: boolean
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  onOpenMap: () => void
}) {
  const mapped = useMemo(() => mappedDailyEntries<TimelineEntry>(day), [day])
  const points = useMemo(() => mapped.map((entry, index) => ({
    id: entry.key,
    lat: entry.lat as number,
    lng: entry.lng as number,
    label: index + 1,
    title: entry.title,
    subtitle: entry.address ?? undefined,
    itemType: entry.itemType,
    emphasis: entry.status === 'completed' || entry.status === 'skipped' ? 'dimmed' as const : 'strong' as const,
  })), [mapped])
  const coordinateKey = points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|')
  const routeRequests = useRef(new LatestRouteRequestController())
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([])
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [mapFailed, setMapFailed] = useState(false)

  useEffect(() => {
    setRoutePath([])
    setMapFailed(false)
    if (dailyRouteMode(points.length) !== 'directions') {
      setRouteState('idle')
      return
    }
    const requests = routeRequests.current
    const controller = requests.begin()
    setRouteState('loading')
    void getFullRoute(points, { signal: controller.signal }).then((result) => {
      if (!requests.isCurrent(controller)) return
      if (!result) {
        setRouteState('unavailable')
        return
      }
      setRoutePath(result.route.polylinePath)
      setRouteState('ready')
    })
    return () => requests.cancel(controller)
    // Coordinate identity, rather than object identity, is the route request contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey])

  const title = dailyRouteTitle(day, points.length, isToday)
  if (points.length === 0) {
    return (
      <section aria-labelledby="daily-route-title">
        <h2 id="daily-route-title" className={styles.routeTitle}>{title}</h2>
        <div className={styles.routeEmpty}>No mapped places for this day</div>
      </section>
    )
  }

  const summary = `${day.dayNumber != null ? `Day ${day.dayNumber}` : 'Selected day'} route with ${points.length} mapped ${points.length === 1 ? 'stop' : 'stops'}`
  return (
    <section aria-labelledby="daily-route-title">
      <div className={styles.routeHeader}>
        <h2 id="daily-route-title" className={styles.routeTitle}>{title}</h2>
        {routeState === 'loading' && <span role="status" className={styles.routeStatus}>Finding route…</span>}
        {routeState === 'unavailable' && <span className={styles.routeStatus}>Showing locations</span>}
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${summary}. Open full map`}
        className={styles.mapFrame}
        onClick={onOpenMap}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpenMap()
          }
        }}
      >
        <div aria-hidden="true" inert className={styles.mapCanvas}>
          {mapFailed ? (
            <div className={styles.mapFallback}>
              <span className={styles.fallbackGridA} />
              <span className={styles.fallbackGridB} />
              {points.map((point, index) => <span key={point.id} className={styles.fallbackPin} style={{ left: `${18 + index * (64 / Math.max(1, points.length - 1))}%`, top: `${56 - (index % 2) * 20}%` }}>{index + 1}</span>)}
            </div>
          ) : (
            <TripboxMap
              points={points}
              routePath={routePath}
              interactive={false}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              onMapError={() => setMapFailed(true)}
              fitPadding={34}
              showZoomControls={false}
            />
          )}
        </div>
        <span aria-hidden="true" className={styles.mapBadge}>Open map</span>
      </div>
    </section>
  )
}

export function DailyItineraryView({ days, day, selectedDayId, overnightBase, lifecycle, today, canEdit, selectedItemId, onSelectItem, onSelectDay, onBack, onAdd, onOpenMap, children, afterRoute }: DailyItineraryViewProps) {
  const topRef = useRef<HTMLDivElement | null>(null)
  const index = Math.max(0, days.findIndex((entry) => dailyDayId(entry) === selectedDayId))
  const previousId = adjacentDailyDayId(days, selectedDayId, -1)
  const nextId = adjacentDailyDayId(days, selectedDayId, 1)
  const displayNumber = day.dayNumber ?? index + 1

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    onSelectItem?.(null)
  }, [onSelectItem, selectedDayId])

  return (
    <div ref={topRef} aria-label="Daily itinerary" className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <button type="button" onClick={onBack} aria-label="Back to Overview" className={styles.backButton}><ChevronLeft size={16} aria-hidden="true" />Overview</button>
          {canEdit ? (
            <button type="button" onClick={onAdd} aria-label="Add activity" title="Add activity" className={`${styles.circleButton} ${styles.addButton}`}><Plus size={21} strokeWidth={2.4} aria-hidden="true" /></button>
          ) : <span className={styles.viewOnly}>View only</span>}
        </div>
        <div className={styles.dayNav}>
          <button type="button" onClick={() => previousId && onSelectDay(previousId)} disabled={!previousId} aria-label="Previous day" className={styles.circleButton}><ChevronLeft size={19} aria-hidden="true" /></button>
          <div className={styles.dayLabel}>
            <h1 className={styles.dayTitle}>Day {displayNumber} <span>of {days.length}</span></h1>
            <div className={styles.dayDate}>{fullDate(day.date)}</div>
            {overnightBase && (
              <div className={styles.dayBase}>
                <Moon size={11} strokeWidth={2.2} aria-hidden="true" />
                Night in {overnightBase}
              </div>
            )}
          </div>
          <button type="button" onClick={() => nextId && onSelectDay(nextId)} disabled={!nextId} aria-label="Next day" className={styles.circleButton}><ChevronRight size={19} aria-hidden="true" /></button>
        </div>
      </header>

      <div className={styles.body}>
        <section aria-label={day.date ? `Plan for ${day.date}` : `Plan for day ${displayNumber}`}>{children}</section>
        <DailyRoutePreview day={day} isToday={lifecycle === 'active' && day.date === today} selectedItemId={selectedItemId} onSelectItem={onSelectItem} onOpenMap={onOpenMap} />
        {afterRoute}
      </div>
    </div>
  )
}
