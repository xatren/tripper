'use client'

import { Clock, MapPin, MapPinPlus, Route as RouteIcon } from 'lucide-react'
import { MobileBottomSheet } from '@/components/mobile'
import type { DiscoverRoute } from '@/lib/discover/discover-routes.generated'
import styles from './DiscoverRouteSheet.module.css'

export interface DiscoverRouteSheetProps {
  /** Null closes the sheet; MobileBottomSheet handles its own mount/unmount transition. */
  route: DiscoverRoute | null
  onClose: () => void
  /**
   * Title of the active editable trip, if any. Enables the secondary "Add to
   * my trip" action (§18 open question #12, resolved) — when there is no
   * editable trip to append to, only the primary "Use This Route" shows.
   */
  activeTripTitle: string | null
  /** "Use This Route" (clone to a new trip) is in flight for this route. */
  cloning: boolean
  /** "Add to my trip" (append every waypoint to the active trip) is in flight for this route. */
  appending: boolean
  onUseRoute: () => void
  onAddToActiveTrip: () => void
}

/**
 * The `routes` category's detail sheet (§9 Phase 7) — a sibling of
 * `DiscoverPlaceSheet` rather than a shared component, carrying a route's own
 * fields (distance/duration/season/highlights) and its own two-action CTA
 * instead of `AddToRouteButton`'s four states: a route is never "already
 * added" or duplicate-checked the way a single place is (§9.3 doesn't apply
 * to a multi-waypoint clone/append).
 */
export function DiscoverRouteSheet({
  route,
  onClose,
  activeTripTitle,
  cloning,
  appending,
  onUseRoute,
  onAddToActiveTrip,
}: DiscoverRouteSheetProps) {
  const busy = cloning || appending

  return (
    <MobileBottomSheet open={route != null} onClose={onClose} title={route?.name ?? ''}>
      {route && (
        <div className={styles.body}>
          <div className={styles.meta}>
            <span className={styles.metaRow}>
              <MapPin size={13} aria-hidden="true" />
              {route.country}
            </span>
            <span className={styles.tagPill}>{route.emoji} {route.tag}</span>
            <span className={styles.metaRow}>
              <RouteIcon size={13} aria-hidden="true" />
              {route.distance}
            </span>
            <span className={styles.metaRow}>
              <Clock size={13} aria-hidden="true" />
              {route.duration}
            </span>
          </div>

          <p className={styles.description}>{route.description}</p>

          {route.highlights.length > 0 && (
            <ul className={styles.highlights}>
              {route.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onUseRoute}
              disabled={busy}
              aria-busy={cloning}
            >
              <MapPinPlus size={15} aria-hidden="true" />
              {cloning ? 'Creating your trip…' : 'Use This Route'}
            </button>

            {activeTripTitle && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onAddToActiveTrip}
                disabled={busy}
                aria-busy={appending}
              >
                {appending ? 'Adding…' : `Add to ${activeTripTitle}`}
              </button>
            )}
          </div>
        </div>
      )}
    </MobileBottomSheet>
  )
}
