'use client'

import { forwardRef } from 'react'
import type { DiscoverPlace } from '@/lib/discover/discover-places.generated'
import { DiscoverPlaceCard } from './DiscoverPlaceCard'
import styles from './DiscoverResultsList.module.css'

export interface DiscoverResultsListProps {
  places: readonly DiscoverPlace[]
  /** Falls back into a card's second line when the place has no `region`. */
  countryName?: string | null
  selectedPlaceId: string | null
  onSelectPlace: (id: string) => void
  onOpenDetail?: (id: string) => void
  addedIds?: ReadonlySet<string>
  /** Desktop rail only (§13). */
  onHoverPlace?: (id: string | null) => void
}

/**
 * The scrolling body of the Discover sheet. `data-place-id` on each `<li>`
 * lets `DiscoverClient.selectFromMap` scroll a marker-tapped card into view
 * without a second id-to-DOM lookup table.
 */
export const DiscoverResultsList = forwardRef<HTMLUListElement, DiscoverResultsListProps>(
  function DiscoverResultsList({ places, countryName, selectedPlaceId, onSelectPlace, onOpenDetail, addedIds, onHoverPlace }, ref) {
    return (
      <ul className={styles.list} ref={ref}>
        {places.map((place) => (
          <li key={place.id} data-place-id={place.id}>
            <DiscoverPlaceCard
              place={place}
              fallbackRegion={countryName}
              isSelected={place.id === selectedPlaceId}
              isAdded={addedIds?.has(place.id)}
              onSelect={onSelectPlace}
              onOpenDetail={onOpenDetail}
              onHoverPlace={onHoverPlace}
            />
          </li>
        ))}
      </ul>
    )
  },
)
