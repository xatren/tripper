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
  variant?: 'plan' | 'daily'
}

function actionButton(label: string, onClick: () => void, icon: ReactNode, danger = false) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, minHeight: 44, padding: '7px 10px',
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
export function ItineraryItemRow({ entry, timezone, canEdit, onEdit, onToggleComplete, onMove, onDelete, dragHandleProps, isDragging, selected, onSelect, variant = 'plan' }: ItineraryItemRowProps) {
  const typeMeta = ITEM_TYPE_META[entry.itemType as ItineraryItemType] ?? ITEM_TYPE_META.place
  const statusMeta = STATUS_META[entry.status as ItineraryItemStatus] ?? STATUS_META.planned
  const timeLabel = entry.startAt ? formatWallTime(entry.startAt, timezone) : entry.allDay ? 'All day' : '—'
  const duration = entry.startAt && entry.endAt ? formatDuration(entry.startAt, entry.endAt) : null
  const completed = entry.status === 'completed'
  const showBooking = BOOKING_TYPES.has(entry.itemType as ItineraryItemType) && entry.status !== 'planned' && entry.status !== 'skipped'
  const editable = canEdit && entry.editable

  if (variant === 'daily') {
    const stateLabel = entry.conflict ? 'Conflict' : statusMeta.label
    const nodeColor = entry.conflict
      ? '#fbbf24'
      : entry.status === 'completed'
        ? '#5dbb93'
        : entry.status === 'skipped'
          ? '#77758f'
          : entry.status === 'arrived'
            ? '#67e8f9'
            : entry.status === 'on_the_way'
              ? '#38bdf8'
              : typeMeta.color
    const activate = () => {
      onSelect?.()
      if (editable) onEdit(entry)
    }
    const dimmed = entry.status === 'completed' || entry.status === 'skipped'

    return (
      <div style={{ position: 'relative', paddingLeft: 54, minHeight: 88, opacity: entry.status === 'skipped' ? .58 : 1 }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 25, top: -12, bottom: -12, width: 2, translate: '-50% 0', background: entry.status === 'skipped' ? 'repeating-linear-gradient(to bottom, rgba(147,145,170,.38) 0 5px, transparent 5px 10px)' : 'rgba(147,145,170,.34)' }} />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', zIndex: 1, left: 4, top: 13, width: 42, height: 42, borderRadius: '50%',
            display: 'grid', placeItems: 'center', color: nodeColor, background: entry.status === 'completed' ? 'rgba(38,112,83,.95)' : '#17152f',
            border: `2px ${entry.status === 'skipped' ? 'dashed' : 'solid'} ${nodeColor}`,
            boxShadow: entry.status === 'on_the_way' || selected ? `0 0 18px ${typeMeta.softColor}` : '0 0 0 4px rgba(8,7,25,.72)',
          }}
        >
          {entry.status === 'completed' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
          ) : typeMeta.icon}
        </span>

        <div
          role="button"
          tabIndex={0}
          aria-pressed={onSelect ? selected : undefined}
          aria-label={`${timeLabel}, ${entry.title}, ${stateLabel}`}
          onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) activate() }}
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              activate()
            }
          }}
          style={{
            position: 'relative', minHeight: 84, padding: '13px 14px 12px', borderRadius: 19,
            background: isDragging ? 'rgba(39,35,66,.98)' : '#1a1832',
            border: `1px solid ${entry.conflict ? 'rgba(251,191,36,.55)' : selected ? 'rgba(245,166,35,.72)' : 'rgba(255,255,255,.10)'}`,
            boxShadow: selected ? '0 0 0 2px rgba(245,166,35,.10)' : '0 12px 28px rgba(2,2,12,.15)',
            cursor: editable || onSelect ? 'pointer' : 'default',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: dimmed ? 'rgba(210,208,225,.56)' : tokens.textMuted, fontSize: 12, lineHeight: 1.2, fontWeight: 800 }}>{timeLabel}</span>
            {duration && <span style={{ color: tokens.textMuted, fontSize: 12, lineHeight: 1.2, fontWeight: 750, whiteSpace: 'nowrap' }}>{duration}</span>}
          </div>
          <div style={{ marginTop: 5, paddingRight: editable && dragHandleProps ? 34 : 0, color: dimmed ? 'rgba(225,223,235,.58)' : tokens.textPrimary, fontSize: 15, lineHeight: 1.27, fontWeight: 800, textDecoration: entry.status === 'completed' || entry.status === 'skipped' ? 'line-through' : 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {entry.title}
          </div>
          {(entry.address || entry.source === 'stop' || entry.conflict || entry.status !== 'planned') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7, minWidth: 0 }}>
              {entry.address && <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 4, color: tokens.textMuted, fontSize: 12, lineHeight: 1.25 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.address}</span></span>}
              {entry.source === 'stop' && <StatusChip tone="neutral">From route</StatusChip>}
              {entry.status !== 'planned' && <StatusChip tone={statusMeta.tone}>{statusMeta.label}</StatusChip>}
              {entry.conflict && <StatusChip tone="warning">Conflict</StatusChip>}
              {entry.isLocked && <StatusChip tone="neutral">Locked</StatusChip>}
              {showBooking && <StatusChip tone="success">Booked</StatusChip>}
            </div>
          )}
          {editable && dragHandleProps && (
            <button
              type="button"
              aria-label={`Reorder ${entry.title}`}
              title={`Reorder ${entry.title}`}
              {...dragHandleProps}
              onClick={(event) => event.stopPropagation()}
              style={{ position: 'absolute', right: 4, top: 35, width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: DUSK.textMuted, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true"><circle cx="2" cy="2" r="1.2" fill="currentColor" /><circle cx="6" cy="2" r="1.2" fill="currentColor" /><circle cx="2" cy="7" r="1.2" fill="currentColor" /><circle cx="6" cy="7" r="1.2" fill="currentColor" /><circle cx="2" cy="12" r="1.2" fill="currentColor" /><circle cx="6" cy="12" r="1.2" fill="currentColor" /></svg>
            </button>
          )}
        </div>

        {editable && selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, paddingTop: 4, flexWrap: 'wrap' }}>
            {entry.status !== 'completed' && entry.status !== 'skipped' && actionButton('Mark done', () => onToggleComplete(entry), <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>)}
            {actionButton('Move to day', () => onMove(entry), <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M3 9.5h18" /></svg>)}
            {actionButton('Delete', () => onDelete(entry), <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" /></svg>, true)}
          </div>
        )}
      </div>
    )
  }

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
          {!completed && entry.status !== 'skipped' && actionButton(
            'Mark done',
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
