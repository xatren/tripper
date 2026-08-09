'use client'

import { Clock, MapPin } from 'lucide-react'
import { MobileBottomSheet } from '@/components/mobile'
import { safeCoverImageUrl } from '@/lib/media-url'
import { discoverCategory } from '@/lib/discover/categories'
import type { DiscoverPlace } from '@/lib/discover/discover-places.generated'
import { AddToRouteButton, type AddToRouteTripOption } from './AddToRouteButton'
import styles from './DiscoverPlaceSheet.module.css'

export interface DiscoverPlaceSheetProps {
  /** Null closes the sheet; MobileBottomSheet handles its own mount/unmount transition. */
  place: DiscoverPlace | null
  countryName?: string | null
  onClose: () => void
  /** True once this place is already on the active trip's route (§9.3). */
  isAdded: boolean
  /** This place's insert is in flight. */
  saving: boolean
  /** Owner/editor trips only. Empty renders "Start a trip here". */
  editableTrips: readonly AddToRouteTripOption[]
  onAddToTrip: (tripId: string) => void
  onStartTrip: () => void
}

/**
 * The detail sheet opened from a selected card (§4.4) — a modal
 * `MobileBottomSheet`, not the persistent `DraggableSheet`, since this is one
 * place rather than the results list. Carries the primary "Add to Route"
 * action (§9.1/§9.2, curated-only for v1) alongside the place itself,
 * including the per-file `imageAttribution` the list view cannot carry (§18.3).
 */
export function DiscoverPlaceSheet({
  place,
  countryName,
  onClose,
  isAdded,
  saving,
  editableTrips,
  onAddToTrip,
  onStartTrip,
}: DiscoverPlaceSheetProps) {
  const image = place ? safeCoverImageUrl(place.imageUrl) : null
  const category = place && place.categories.length > 0 ? discoverCategory(place.categories[0]) : null

  return (
    <MobileBottomSheet open={place != null} onClose={onClose} title={place?.name ?? ''}>
      {place && (
        <div className={styles.body}>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.photo} src={image} alt="" loading="lazy" decoding="async" />
          )}

          <div className={styles.meta}>
            <span className={styles.metaRow}>
              <MapPin size={13} aria-hidden="true" />
              {place.region ?? countryName ?? 'Region unknown'}
            </span>
            {category && (
              <span className={styles.categoryPill} style={{ borderColor: category.markerColor }}>
                {category.label}
              </span>
            )}
            {place.suggestedHours != null && (
              <span className={styles.metaRow}>
                <Clock size={13} aria-hidden="true" />
                ~{place.suggestedHours}h suggested
              </span>
            )}
          </div>

          {place.blurb && <p className={styles.blurb}>{place.blurb}</p>}

          <AddToRouteButton
            placeName={place.name}
            isAdded={isAdded}
            saving={saving}
            trips={editableTrips}
            onAddToTrip={onAddToTrip}
            onStartTrip={onStartTrip}
          />

          {place.imageAttribution && <p className={styles.attribution}>{place.imageAttribution}</p>}
        </div>
      )}
    </MobileBottomSheet>
  )
}
