'use client'

import { tokens, EmptyState, InlineError, SkeletonBlock, FilterChip } from '@/components/mobile'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import type { CategoryChip } from './explore-logic'

export interface ExploreResultItem {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  category?: string
  distanceMeters: number | null
}

export type ExploreSearchStatus = 'idle' | 'loading' | 'success' | 'network_error' | 'rate_limited'

export interface ExploreResultsListProps {
  status: ExploreSearchStatus
  results: ExploreResultItem[]
  destinationLabel: string | null
  categories: CategoryChip[]
  selectedResultId: string | null
  onSelectCategory: (id: string) => void
  onRetry: () => void
  onSelectResult: (result: ExploreResultItem) => void
}

function ResultCard({ result, selected, onSelect }: { result: ExploreResultItem; selected: boolean; onSelect: () => void }) {
  const distanceUnit = useDistanceUnit()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        width: '100%', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left',
        padding: '12px 14px', borderRadius: tokens.radius16, cursor: 'pointer', fontFamily: 'inherit',
        background: tokens.surfaceSolid, border: `1px solid ${selected ? 'rgba(245,166,35,.72)' : 'rgba(255,255,255,.08)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, color: tokens.textPrimary, fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.name}
        </span>
        {result.distanceMeters != null && (
          <span style={{ flex: 'none', color: tokens.accentLight, fontSize: 11.5, fontWeight: 700 }}>
            {formatDistanceValue(result.distanceMeters, distanceUnit)}
          </span>
        )}
      </div>
      {result.category && (
        <span style={{ color: tokens.textMuted, fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize' }}>
          {result.category.split(',')[0].trim()}
        </span>
      )}
      <span style={{ color: tokens.textSecondary, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {result.address}
      </span>
    </button>
  )
}

/**
 * Loading/empty/error/results states for the search list. Ratings, photos,
 * and open-now status are intentionally never shown here: Mapbox's Geocoding
 * API (the only place-search source wired into this app) doesn't return
 * them, so surfacing empty-but-styled slots for them would read as fake data.
 */
export function ExploreResultsList({ status, results, destinationLabel, categories, selectedResultId, onSelectCategory, onRetry, onSelectResult }: ExploreResultsListProps) {
  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-label="Searching" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
        {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={78} />)}
      </div>
    )
  }

  if (status === 'network_error') {
    return <InlineError onRetry={onRetry}>Couldn&apos;t reach the search service. Check your connection and try again.</InlineError>
  }

  if (status === 'rate_limited') {
    return <InlineError>Too many searches at once — wait a moment and try again.</InlineError>
  }

  if (status === 'idle') {
    return (
      <EmptyState
        title="Find a place to add"
        description={destinationLabel ? `Search restaurants, museums, hotels, and more near ${destinationLabel}.` : 'Search restaurants, museums, hotels, and more.'}
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {categories.filter((c) => c.id !== 'all').slice(0, 4).map((c) => (
              <FilterChip key={c.id} selected={false} onClick={() => onSelectCategory(c.id)}>{c.label}</FilterChip>
            ))}
          </div>
        }
      />
    )
  }

  if (results.length === 0) {
    return (
      <EmptyState
        title="No results"
        description={destinationLabel ? `Nothing matched near ${destinationLabel}. Try a different search or category.` : 'Try a different search or category.'}
      />
    )
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {results.map((result) => (
        <li key={result.id}>
          <ResultCard result={result} selected={result.id === selectedResultId} onSelect={() => onSelectResult(result)} />
        </li>
      ))}
    </ul>
  )
}
