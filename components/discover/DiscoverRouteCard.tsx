'use client'

import { ChevronRight } from 'lucide-react'
import type { DiscoverRoute } from '@/lib/discover/discover-routes.generated'
import styles from './DiscoverRouteCard.module.css'

export interface DiscoverRouteCardProps {
  route: DiscoverRoute
  isSelected: boolean
  onSelect: (id: string) => void
  /** Opens DiscoverRouteSheet. Only rendered once the card is already selected — mirrors DiscoverPlaceCard. */
  onOpenDetail?: (id: string) => void
}

/**
 * One row in the Discover results sheet for the `routes` category (§9 Phase
 * 7) — a sibling of `DiscoverPlaceCard` rather than a shared component, since
 * a route has no image/region/rank and its selection previews a polyline, not
 * a pin (§5 line layer). Same row/select/chevron contract otherwise, so the
 * two read as one system.
 */
export function DiscoverRouteCard({ route, isSelected, onSelect, onOpenDetail }: DiscoverRouteCardProps) {
  return (
    <span className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}>
      <button
        type="button"
        className={styles.rowMain}
        aria-pressed={isSelected}
        onClick={() => onSelect(route.id)}
      >
        <span className={styles.emoji} aria-hidden="true">{route.emoji}</span>
        <span className={styles.rowText}>
          <span className={styles.rowName}>{route.name}</span>
          <span className={styles.rowMeta}>{route.tag} · {route.distance} · {route.duration}</span>
        </span>
      </button>
      {isSelected && onOpenDetail && (
        <button
          type="button"
          className={styles.detailButton}
          onClick={() => onOpenDetail(route.id)}
          aria-label={`View details for ${route.name}`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
