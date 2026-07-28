'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { tokens, StatusChip } from '@/components/mobile'
import type { ItineraryItemStatus, ItineraryItemType } from '@/types'
import type { TimelineEntry } from '../itinerary-projection'
import { BOOKING_TYPES, ITEM_TYPE_META, STATUS_META, formatDuration, formatWallTime } from './itinerary-ui'
import { DUSK } from '@/components/design/tokens'

export interface ItineraryItemRowProps {
  entry: TimelineEntry
  /** Wall-clock zone used to render times (falls back to device zone). */
  timezone?: string | null
  canEdit: boolean
  onEdit: (entry: TimelineEntry) => void
  onToggleComplete: (entry: TimelineEntry) => void
  onMove: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
  /** dnd-kit handle wiring; absent for read-only rows. */
  dragHandleProps?: HTMLAttributes<HTMLButtonElement> & Record<string, unknown>
  isDragging?: boolean
  selected?: boolean
  onSelect?: () => void
}

function actionButton(label: string, onClick: () => void, icon: ReactNode, danger = false) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, minHeight: 32, padding: '5px 10px',
        borderRadius: tokens.radius8, cursor: 'pointer', fontFamily: 'inherit',
        background: danger ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${danger ? 'rgba(239,68,68,.25)' : 'rgba(255,255,255,.1)'}`,
        color: danger ? tokens.danger : tokens.textSecondary, fontSize: 11.5, fontWeight: 700,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * One timeline row: time column, type icon, title, location, duration, and
 * status/booking indicators. Solid dark surface — rows never blur; glass is
 * reserved for the surrounding chrome.
 */
export function ItineraryItemRow({ entry, timezone, canEdit, onEdit, onToggleComplete, onMove, onDelete, dragHandleProps, isDragging, selected, onSelect }: ItineraryItemRowProps) {
  const typeMeta = ITEM_TYPE_META[entry.itemType as ItineraryItemType] ?? ITEM_TYPE_META.place
  const statusMeta = STATUS_META[entry.status as ItineraryItemStatus] ?? STATUS_META.planned
  const timeLabel = entry.startAt ? formatWallTime(entry.startAt, timezone) : entry.allDay ? 'All day' : '—'
  const duration = entry.startAt && entry.endAt ? formatDuration(entry.startAt, entry.endAt) : null
  const completed = entry.status === 'completed'
  const showBooking = BOOKING_TYPES.has(entry.itemType as ItineraryItemType) && entry.status !== 'planned' && entry.status !== 'skipped'
  const editable = canEdit && entry.editable

  return (
    <div style={{ opacity: entry.status === 'skipped' ? 0.55 : 1 }}>
      <div
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-pressed={onSelect ? selected : undefined}
        onClick={(event) => {
          if (!onSelect || (event.target as HTMLElement).closest('button')) return
          onSelect()
        }}
        onKeyDown={(event) => {
          if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onSelect()
          }
        }}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
          borderRadius: tokens.radius16,
          background: isDragging ? 'rgba(255,255,255,.09)' : tokens.surfaceSolid,
          border: `1px solid ${isDragging ? 'rgba(245,166,35,.4)' : selected ? 'rgba(245,166,35,.75)' : entry.conflict ? 'rgba(251,191,36,.4)' : 'rgba(255,255,255,.09)'}`,
          boxShadow: selected ? '0 0 0 2px rgba(245,166,35,.14)' : undefined,
          cursor: onSelect ? 'pointer' : undefined,
        }}
      >
        {editable && dragHandleProps && (
          <button
            type="button"
            aria-label={`Reorder ${entry.title}`}
            {...dragHandleProps}
            style={{
              flex: 'none', width: 24, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: isDragging ? 'grabbing' : 'grab', color: DUSK.textMuted,
              touchAction: 'none', padding: 0,
            }}
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
              <circle cx="2" cy="2" r="1.2" fill="currentColor" /><circle cx="6" cy="2" r="1.2" fill="currentColor" />
              <circle cx="2" cy="7" r="1.2" fill="currentColor" /><circle cx="6" cy="7" r="1.2" fill="currentColor" />
              <circle cx="2" cy="12" r="1.2" fill="currentColor" /><circle cx="6" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </button>
        )}

        <div style={{ flex: 'none', width: 58, paddingTop: 2 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: entry.startAt ? tokens.textPrimary : tokens.textMuted, whiteSpace: 'nowrap' }}>{timeLabel}</div>
          {duration && <div style={{ fontSize: 10.5, fontWeight: 600, color: tokens.textMuted, marginTop: 2 }}>{duration}</div>}
        </div>

        <span
          aria-hidden="true"
          style={{
            flex: 'none', width: 30, height: 30, borderRadius: tokens.radius8, marginTop: 1,
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: completed ? tokens.success : tokens.accentLight,
          }}
        >
          {typeMeta.icon}
        </span>

        <button
          type="button"
          onClick={() => onSelect ? onSelect() : editable && onEdit(entry)}
          disabled={!editable && !onSelect}
          aria-label={onSelect ? `Show ${entry.title} on map` : editable ? `Edit ${entry.title}` : undefined}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0,
            fontFamily: 'inherit', cursor: editable || onSelect ? 'pointer' : 'default', color: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: completed ? 'line-through' : 'none' }}>
              {entry.title}
            </span>
            {entry.isLocked && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={DUSK.textMuted} strokeWidth="2" aria-label="Locked" style={{ flex: 'none' }}>
                <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            )}
          </span>
          {entry.address && (
            <span style={{ display: 'block', fontSize: 11.5, color: tokens.textMuted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {entry.address}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{typeMeta.label}</span>
            {entry.source === 'stop' && (
              <StatusChip tone="neutral">From route</StatusChip>
            )}
            {entry.status !== 'planned' && (
              <StatusChip tone={statusMeta.tone}>{statusMeta.label}</StatusChip>
            )}
            {showBooking && (
              <StatusChip
                tone="success"
                icon={<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              >
                Booked
              </StatusChip>
            )}
            {entry.conflict && (
              <StatusChip
                tone="warning"
                icon={<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 3L22 20H2L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
              >
                Overlaps
              </StatusChip>
            )}
          </span>
        </button>
      </div>

      {editable && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '6px 4px 0' }}>
          {onSelect && actionButton(
            'Edit',
            () => onEdit(entry),
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
          )}
          {actionButton(
            completed ? 'Mark planned' : 'Mark done',
            () => onToggleComplete(entry),
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
          )}
          {actionButton(
            'Move to day',
            () => onMove(entry),
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M8 2.5v4M16 2.5v4M3 9.5h18" /></svg>,
          )}
          {actionButton(
            'Delete',
            () => onDelete(entry),
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>,
            true,
          )}
        </div>
      )}
    </div>
  )
}
