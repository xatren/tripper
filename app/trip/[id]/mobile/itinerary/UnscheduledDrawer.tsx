'use client'

import { useState } from 'react'
import { tokens } from '@/components/mobile'
import type { TimelineEntry } from '../itinerary-projection'
import { ItineraryItemRow } from './ItineraryItemRow'

export interface UnscheduledDrawerProps {
  entries: TimelineEntry[]
  canEdit: boolean
  onEdit: (entry: TimelineEntry) => void
  onToggleComplete: (entry: TimelineEntry) => void
  /** Opens the day picker — the "Add to day" affordance. */
  onMove: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
}

/** Collapsible holding area for saved items that don't have a day yet. */
export function UnscheduledDrawer({ entries, canEdit, onEdit, onToggleComplete, onMove, onDelete }: UnscheduledDrawerProps) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null

  return (
    <section aria-label="Unscheduled items" style={{ marginTop: 24 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
          padding: '10px 14px', borderRadius: tokens.radius16, cursor: 'pointer', fontFamily: 'inherit',
          background: 'rgba(255,255,255,.045)', border: '1px dashed rgba(255,255,255,.16)',
          color: tokens.textSecondary, textAlign: 'left',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
          <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
          Unscheduled
          <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>
            {entries.length} {entries.length === 1 ? 'item' : 'items'}
          </span>
        </span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: 'none', transition: 'transform .25s ease', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: tokens.textMuted, lineHeight: 1.5 }}>
            {canEdit ? 'Use “Move to day” to slot an item into the plan.' : 'These saved items have no day yet.'}
          </p>
          {entries.map((entry) => (
            <ItineraryItemRow
              key={entry.key}
              entry={entry}
              canEdit={canEdit}
              onEdit={onEdit}
              onToggleComplete={onToggleComplete}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}
