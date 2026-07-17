'use client'

import { tokens, FilterChip } from '@/components/mobile'
import type { CategoryChip } from './explore-logic'

export interface ExploreDestinationOption {
  id: string
  label: string
  lat: number
  lng: number
}

export interface ExploreSearchBarProps {
  query: string
  onQueryChange: (value: string) => void
  destinations: ExploreDestinationOption[]
  selectedDestinationId: string | null
  onSelectDestination: (id: string) => void
  categories: CategoryChip[]
  activeCategoryId: string
  onSelectCategory: (id: string) => void
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none',
}

/** Sticky search header: free-text query, "near <stop>" destination picker, category chips. */
export function ExploreSearchBar({
  query, onQueryChange, destinations, selectedDestinationId, onSelectDestination,
  categories, activeCategoryId, onSelectCategory,
}: ExploreSearchBarProps) {
  return (
    <div
      className="glass-standard"
      style={{
        position: 'sticky', top: 0, zIndex: 5,
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '12px 16px 12px', margin: '0 -16px',
      }}
    >
      <div style={{ position: 'relative' }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tokens.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <label htmlFor="explore-search-input" className="sr-only">Search for a place</label>
        <input
          id="explore-search-input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search restaurants, museums, hotels…"
          style={{
            width: '100%', minHeight: 44, padding: '0 14px 0 40px', borderRadius: tokens.radius12,
            background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
            color: tokens.textPrimary, fontSize: 14.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,.08)', border: 'none', color: tokens.textSecondary, cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>

      {destinations.length > 0 && (
        <div role="group" aria-label="Search near" style={ROW_STYLE}>
          {destinations.map((d) => (
            <FilterChip key={d.id} selected={d.id === selectedDestinationId} onClick={() => onSelectDestination(d.id)}>
              Near {d.label}
            </FilterChip>
          ))}
        </div>
      )}

      <div role="group" aria-label="Category" style={ROW_STYLE}>
        {categories.map((c) => (
          <FilterChip key={c.id} selected={c.id === activeCategoryId} onClick={() => onSelectCategory(c.id)}>
            {c.label}
          </FilterChip>
        ))}
      </div>
    </div>
  )
}
