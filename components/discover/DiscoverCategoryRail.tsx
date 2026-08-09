'use client'

import { useEffect, useRef } from 'react'
import { categoryAvailableAtZoom, curatedCategories, type DiscoverCategory, type DiscoverCategoryId } from '@/lib/discover/categories'
import styles from './DiscoverCategoryRail.module.css'

export interface DiscoverCategoryRailProps {
  active: DiscoverCategoryId
  onChange: (id: DiscoverCategoryId) => void
  /** Result count per category for the framed country. A zero still renders — the empty state explains itself. */
  counts?: Partial<Record<DiscoverCategoryId, number>>
  /**
   * Defaults to the curated layers. Pass both curated and live categories once
   * Phase 5's live layers are wired to make them selectable.
   */
  categories?: DiscoverCategory[]
  /**
   * The map's current zoom (§14 — read imperatively, mirrored here only for
   * the gate). A live (Places) chip is disabled below its `minZoom`, since a
   * 50 km circle is meaningless at country scale (§7.1) — undefined (map not
   * loaded yet) is treated as "not zoomed in enough" rather than assumed ok.
   */
  zoom?: number
}

/**
 * The layer switcher. A segmented group with `aria-pressed`, not a tablist: there
 * is no tab/panel relationship here — the "panel" is the map, which stays mounted
 * and simply swaps its source. Mirrors the trips filter contract in
 * `tests/accessibility-contracts.test.mts`.
 */
export function DiscoverCategoryRail({ active, onChange, counts, categories, zoom }: DiscoverCategoryRailProps) {
  const list = categories ?? curatedCategories()
  const railRef = useRef<HTMLDivElement | null>(null)

  // A deep link can land on a chip that is scrolled out of view, which reads as
  // the rail having no selection at all.
  useEffect(() => {
    const selected = railRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <div
      ref={railRef}
      className={styles.rail}
      role="group"
      aria-label="Filter places by category"
      aria-controls="discover-results"
    >
      {list.map((category) => {
        const count = counts?.[category.id]
        const isActive = category.id === active
        const zoomGated = category.source === 'places' && !categoryAvailableAtZoom(category, zoom ?? -Infinity)
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.chip} ${isActive ? styles.chipActive : ''} ${zoomGated ? styles.chipDisabled : ''}`}
            aria-pressed={isActive}
            aria-disabled={zoomGated}
            disabled={zoomGated}
            title={zoomGated ? 'Zoom in on the map to search here' : undefined}
            onClick={() => { if (!zoomGated) onChange(category.id) }}
            style={isActive ? { borderColor: category.markerColor } : undefined}
          >
            <span className={styles.dot} style={{ background: category.markerColor }} aria-hidden="true" />
            {category.label}
            {/* Part of the button's accessible name, so the count is never a
                visual-only signal about whether a layer is worth tapping. */}
            {count !== undefined && <span className={styles.count}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
