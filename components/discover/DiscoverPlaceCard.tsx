'use client'

import { ChevronRight } from 'lucide-react'
import { safeCoverImageUrl } from '@/lib/media-url'
import type { DiscoverPlace } from '@/lib/discover/discover-places.generated'
import styles from './DiscoverPlaceCard.module.css'

export interface DiscoverPlaceCardProps {
  place: DiscoverPlace
  /** Shown when the place has no region of its own — usually the framed country's name. */
  fallbackRegion?: string | null
  isSelected: boolean
  /** True once this place is already on the active trip's route (§9.3 "Already in route"). */
  isAdded?: boolean
  onSelect: (id: string) => void
  /** Opens DiscoverPlaceSheet (§4.4). Only rendered once the card is already selected. */
  onOpenDetail?: (id: string) => void
  /** Desktop rail only (§13); mobile never fires hover events so this stays a no-op there. */
  onHoverPlace?: (id: string | null) => void
}

/**
 * One row in the Discover results sheet. The row itself is the selection
 * control — tapping it sets `selectedPlaceId`, which the map mirrors as the
 * highlighted pin (§4.3). The thumbnail stays decorative (`alt=""`); the name
 * carries the accessible label. A selected row grows a chevron that opens the
 * full detail sheet, matching a marker's popup affordance.
 */
export function DiscoverPlaceCard({ place, fallbackRegion, isSelected, isAdded, onSelect, onOpenDetail, onHoverPlace }: DiscoverPlaceCardProps) {
  const image = safeCoverImageUrl(place.imageUrl)
  return (
    <span className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}>
      <button
        type="button"
        className={styles.rowMain}
        aria-pressed={isSelected}
        onClick={() => onSelect(place.id)}
        onMouseEnter={() => onHoverPlace?.(place.id)}
        onMouseLeave={() => onHoverPlace?.(null)}
      >
        {image ? (
          // Commons thumbnails are already width-capped by the seeder's
          // Special:FilePath query, and next/image would proxy every one of
          // them through our own optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.thumb} src={image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.thumbFallback} aria-hidden="true" />
        )}
        <span className={styles.rowText}>
          <span className={styles.rowName}>{place.name}</span>
          <span className={styles.rowMeta}>{place.region ?? place.blurb ?? fallbackRegion}</span>
        </span>
        {isAdded && <span className={styles.addedBadge}>✓ In your route</span>}
      </button>
      {isSelected && onOpenDetail && (
        <button
          type="button"
          className={styles.detailButton}
          onClick={() => onOpenDetail(place.id)}
          aria-label={`View details for ${place.name}`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
