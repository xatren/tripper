'use client'

import { FilterChip } from '@/components/mobile'
import { GOOGLE_PLACE_CATEGORIES, type GooglePlaceCategoryId } from '@/lib/google-places/category-map'

export function ExploreCategoryChips({ value, onChange }: { value: GooglePlaceCategoryId; onChange: (value: GooglePlaceCategoryId) => void }) {
  return (
    <div role="group" aria-label="Place category" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
      {GOOGLE_PLACE_CATEGORIES.map((category) => (
        <FilterChip key={category.id} selected={value === category.id} onClick={() => onChange(category.id)}>{category.label}</FilterChip>
      ))}
    </div>
  )
}

