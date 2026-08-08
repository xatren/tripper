'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  Check,
  ChevronRight,
  MapPinned,
  MoreHorizontal,
  Plus,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import type { Profile, Stop, Trip, TripCapabilities } from '@/types'
import { localCalendarISO, selectFeaturedTrip } from '@/lib/map-home'
import { createClient } from '@/lib/supabase/client'
import { removeTripStorageObjects } from '@/lib/trip-storage-cleanup'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { showToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppBottomNav } from '@/components/ui/AppBottomNav'
import {
  TRIP_FILTERS,
  emptyStateCopy,
  filterCounts,
  libraryHeadline,
  matchesFilter,
  matchesQuery,
  projectStopMarks,
  selectTripCoverPhoto,
  selectTripPhotoStop,
  seededGradient,
  sortTripsForLibrary,
  statusBadge,
  tripDateLine,
  tripDurationLabel,
  tripFlags,
  tripInitials,
  tripLibraryStatus,
  tripSubtitle,
  tripThumbnail,
  tripLandmarkSearchParams,
  type TripAutoPhoto,
  type TripFilter,
  type TripPhotoCandidate,
} from './trips-library.ts'
import styles from './Trips.module.css'

interface TripsClientProps {
  profile: Profile | null
  trips: Trip[]
  stops: Stop[]
  capabilitiesByTripId: Record<string, TripCapabilities>
}

const autoPhotoCache = new Map<string, TripAutoPhoto | null>()
const autoPhotoRequests = new Map<string, Promise<TripAutoPhoto | null>>()

function requestTripPhoto(stop: Stop): Promise<TripAutoPhoto | null> {
  if (autoPhotoCache.has(stop.id)) return Promise.resolve(autoPhotoCache.get(stop.id) ?? null)
  const pending = autoPhotoRequests.get(stop.id)
  if (pending) return pending

  const request = (async () => {
    try {
      const response = await fetch(`/api/places/search?${tripLandmarkSearchParams(stop)}`, { cache: 'no-store' })
      if (!response.ok) return { photo: null, cacheable: false }
      const payload = await response.json() as { results?: TripPhotoCandidate[] }
      return {
        photo: selectTripCoverPhoto(stop, Array.isArray(payload.results) ? payload.results : []),
        cacheable: true,
      }
    } catch {
      // A network/provider error must not become a permanent no-photo result
      // for the rest of this browser session.
      return { photo: null, cacheable: false }
    }
  })().then(({ photo, cacheable }) => {
      if (cacheable) autoPhotoCache.set(stop.id, photo)
      autoPhotoRequests.delete(stop.id)
      return photo
    })

  autoPhotoRequests.set(stop.id, request)
  return request
}

/**
 * Purely decorative backdrop. This surface is `aria-hidden` and sits blurred behind
 * the trip list, so it deliberately does NOT mount a Mapbox GL context or call the
 * paid Directions API — the shape is projected from stop coordinates we already hold.
 * The interactive maps live on Map Home and inside the trip workspace.
 */
function TripsMapBackdrop({ trip, stops }: { trip: Trip | null; stops: Stop[] }) {
  const marks = useMemo(() => projectStopMarks(stops, trip?.id ?? null), [stops, trip])

  return (
    <div className={styles.mapBackdrop} aria-hidden="true" inert>
      <div className={styles.mapFallback}>
        {marks.length > 1 ? (
          <svg className={styles.fallbackPath} viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={marks.map((mark) => `${mark.x},${mark.y}`).join(' ')} />
          </svg>
        ) : (
          <span className={styles.fallbackLine} />
        )}
        {marks.map((mark) => (
          <span key={mark.id} className={styles.fallbackPin} style={{ left: `${mark.x}%`, top: `${mark.y}%` }} />
        ))}
      </div>
      <div className={styles.mapWash} />
    </div>
  )
}

export function TripsClient({ profile, trips: initialTrips, stops, capabilitiesByTripId }: TripsClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const [trips, setTrips] = useState(initialTrips)
  const [filter, setFilter] = useState<TripFilter>('all')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)

  // One calendar day per mount keeps every card, count and badge on the same reference.
  const today = useMemo(() => localCalendarISO(), [])

  const counts = useMemo(() => filterCounts(trips, today), [today, trips])
  const headline = useMemo(() => libraryHeadline(trips, today), [today, trips])
  const featuredTrip = useMemo(() => selectFeaturedTrip(trips), [trips])
  const stopsByTripId = useMemo(() => {
    const grouped = new Map<string, Stop[]>()
    for (const stop of stops) {
      const group = grouped.get(stop.trip_id) ?? []
      group.push(stop)
      grouped.set(stop.trip_id, group)
    }
    return grouped
  }, [stops])

  const visible = useMemo(() => sortTripsForLibrary(
    trips.filter((trip) => matchesFilter(tripLibraryStatus(trip, today), filter) && matchesQuery(trip, query)),
    today,
  ), [filter, query, today, trips])

  const handleDelete = async (tripId: string) => {
    if (!capabilitiesByTripId[tripId]?.canManageTrip) return
    const cleanup = await removeTripStorageObjects(supabase, tripId)
    if (!cleanup.ok) {
      showToast("Couldn't remove the trip's photos and documents, so the trip was kept. Retry is safe.", 'error')
      return
    }
    const { error } = await supabase.from('trips').delete().eq('id', tripId)
    if (error) {
      showToast("Couldn't delete the trip. Please try again.", 'error')
      return
    }
    setTrips((current) => current.filter((trip) => trip.id !== tripId))
  }

  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }

  return (
    <main className={styles.page}>
      <TripsMapBackdrop trip={featuredTrip} stops={stops} />

      <div className={styles.topScrim} aria-hidden="true" />
      <div className={styles.bottomScrim} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.header}>
          <motion.div className={styles.headerTitles} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <span className={styles.eyebrow}><MapPinned size={13} aria-hidden="true" /> Journey library</span>
            <h1 className={styles.title}>My Trips</h1>
          </motion.div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.iconButton} ${searching ? styles.activeIconButton : ''}`}
              onClick={() => (searching ? closeSearch() : setSearching(true))}
              aria-label={searching ? 'Close trip search' : 'Search trips'}
            >
              {searching ? <X size={19} /> : <Search size={19} />}
            </button>
            <button type="button" className={styles.newTripButton} onClick={() => router.push('/trips/new')}>
              <Plus size={18} aria-hidden="true" />
              <span>New trip</span>
            </button>
          </div>
        </header>

        <AnimatePresence initial={false}>
          {searching && (
            <motion.div className={styles.searchWrap} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 54 }} exit={{ opacity: 0, height: 0 }}>
              <Search size={17} aria-hidden="true" />
              <input
                autoFocus
                className={styles.searchInput}
                type="search"
                enterKeyHint="search"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') closeSearch() }}
                aria-label="Search trips"
                aria-controls="trips-list"
                placeholder="Search trips or destinations"
              />
              {query && (
                <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <section className={styles.summary} aria-label="Trips ahead">
          <span className={styles.summaryValue}>{headline.value}</span>
          <span className={styles.summaryLabel}>{headline.label}</span>
          {headline.hintTripId ? (
            <button
              type="button"
              className={styles.summaryHint}
              onClick={() => router.push(`/trip/${headline.hintTripId}/mobile?section=overview`)}
            >
              <span className={styles.summaryHintText}>{headline.hint}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <p className={styles.summaryHint}><span className={styles.summaryHintText}>{headline.hint}</span></p>
          )}
        </section>

        <section className={styles.library} aria-label="Trip library">
          <div className={styles.filters} role="group" aria-label="Filter trips">
            {TRIP_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                aria-controls="trips-list"
                data-active={filter === id}
                className={styles.filterChip}
                onClick={() => setFilter(id)}
              >
                {label}{counts[id] > 0 && <span className={styles.filterCount}>{counts[id]}</span>}
              </button>
            ))}
          </div>

          <p className={styles.srOnly} role="status" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'trip' : 'trips'}
          </p>

          <div className={styles.list} id="trips-list">
            <AnimatePresence mode="popLayout">
              {visible.length === 0 ? (
                <EmptyState
                  key="empty"
                  filter={filter}
                  query={query}
                  onClearSearch={closeSearch}
                  onNewTrip={() => router.push('/trips/new')}
                />
              ) : visible.map((trip, index) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  stops={stopsByTripId.get(trip.id) ?? []}
                  index={index}
                  today={today}
                  capabilities={capabilitiesByTripId[trip.id]}
                  onOpen={() => router.push(`/trip/${trip.id}/mobile?section=overview`)}
                  onDelete={() => setDeleteTarget(trip)}
                  onCopyCode={async () => {
                    try {
                      await navigator.clipboard.writeText(trip.invite_code ?? '')
                      showToast('Invite code copied.', 'success')
                    } catch {
                      showToast("Couldn't copy the invite code.", 'error')
                    }
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      </div>

      <AppBottomNav active="trips" profile={profile} floating />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this trip?"
        message={deleteTarget ? `\"${deleteTarget.title}\" and all its stops and expenses will be permanently deleted. This can't be undone.` : ''}
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  )
}

function TripCard({ trip, stops, index, today, capabilities, onOpen, onDelete, onCopyCode }: {
  trip: Trip
  stops: Stop[]
  index: number
  today: string
  capabilities?: TripCapabilities
  onOpen: () => void
  onDelete: () => void
  onCopyCode: () => void
}) {
  const thumbRef = useRef<HTMLSpanElement>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  const [nearViewport, setNearViewport] = useState(false)
  const [autoPhoto, setAutoPhoto] = useState<TripAutoPhoto | null>(null)
  const [autoPhotoFailed, setAutoPhotoFailed] = useState(false)
  const status = tripLibraryStatus(trip, today)
  const badge = statusBadge(trip, today)
  const thumbnail = tripThumbnail(trip)
  const coverImageUrl = thumbnail.kind === 'image' ? thumbnail.url : null
  const duration = tripDurationLabel(trip)
  const flag = tripFlags(trip, 1)
  const role = capabilities?.role
  const photoStop = useMemo(() => selectTripPhotoStop(stops), [stops])
  const hasCoverImage = coverImageUrl !== null && !coverFailed

  useEffect(() => {
    const node = thumbRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setNearViewport(true)
      observer.disconnect()
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!nearViewport || hasCoverImage || !photoStop || autoPhotoFailed) return
    let active = true
    void requestTripPhoto(photoStop).then((photo) => {
      if (active) setAutoPhoto(photo)
    })
    return () => { active = false }
  }, [autoPhotoFailed, hasCoverImage, nearViewport, photoStop])

  return (
    <motion.article
      className={styles.tripCard}
      data-status={status}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: .97 }}
      transition={{ delay: Math.min(index, 5) * .045, duration: .24 }}
    >
      <button type="button" className={styles.tripMain} onClick={onOpen} aria-label={`Open ${trip.title}`}>
        <span ref={thumbRef} className={styles.thumb}>
          {hasCoverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.thumbImage}
              src={coverImageUrl ?? undefined}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setCoverFailed(true)}
            />
          ) : autoPhoto && !autoPhotoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.thumbImage}
              src={`/api/places/photo?ref=${encodeURIComponent(autoPhoto.ref)}&maxWidth=320`}
              alt=""
              loading="lazy"
              decoding="async"
              title={`Photo near ${photoStop?.name ?? autoPhoto.placeName}`}
              onError={() => {
                if (photoStop) autoPhotoCache.delete(photoStop.id)
                setAutoPhotoFailed(true)
              }}
            />
          ) : (
            <span className={styles.thumbSeed} style={{ backgroundImage: seededGradient(trip.id) }}>
              {flag
                ? <span className={styles.thumbFlag}>{flag}</span>
                : <span className={styles.thumbInitials}>{tripInitials(trip.title)}</span>}
            </span>
          )}
        </span>

        <span className={styles.tripBody}>
          <strong className={styles.tripTitle}>{trip.title}</strong>
          <span className={styles.tripLine}>
            <span className={styles.statusPill} data-tone={badge.tone}>
              {badge.tone === 'past' && <Check size={10} aria-hidden="true" />}{badge.text}
            </span>
            <span className={styles.destination}>{flag ? `${flag} ` : ''}{tripSubtitle(trip, today)}</span>
          </span>
          <span className={styles.tripMeta}>
            <span className={styles.metaItem}><CalendarDays size={13} aria-hidden="true" />{tripDateLine(trip)}</span>
            {duration && <span className={styles.metaItem}>{duration}</span>}
            {/* Role only earns a chip when it is not the default. */}
            {role && role !== 'owner' && (
              <span className={styles.metaItem}>{role === 'editor' ? 'Editor' : 'Viewer'}</span>
            )}
          </span>
        </span>
      </button>

      {capabilities?.canManageTrip && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={styles.cardMenu} aria-label={`Open actions for ${trip.title}`}><MoreHorizontal size={19} /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyCode}><Ticket size={14} className="mr-2" />Copy invite code</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 size={14} className="mr-2" />Delete trip</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </motion.article>
  )
}

function EmptyState({ filter, query, onClearSearch, onNewTrip }: {
  filter: TripFilter
  query: string
  onClearSearch: () => void
  onNewTrip: () => void
}) {
  const copy = emptyStateCopy(filter, query)

  return (
    <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <span className={styles.emptyIcon} aria-hidden="true"><MapPinned size={25} /></span>
      <strong className={styles.emptyTitle}>{copy.title}</strong>
      <p className={styles.emptyBody}>{copy.body}</p>
      {copy.action === 'clear' && (
        <button type="button" className={styles.emptyAction} onClick={onClearSearch}>Clear search</button>
      )}
      {copy.action === 'new' && (
        <button type="button" className={styles.emptyAction} onClick={onNewTrip}><Plus size={17} aria-hidden="true" />New trip</button>
      )}
      {copy.action === 'create' && (
        <button type="button" className={styles.emptyAction} onClick={onNewTrip}><Plus size={17} aria-hidden="true" />Create new trip</button>
      )}
    </motion.div>
  )
}
