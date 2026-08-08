'use client'

import { useMemo } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { tokens, EmptyState } from '@/components/mobile'
import type { TimelineDay, TimelineEntry } from '../itinerary-projection'
import { ItineraryItemRow } from './ItineraryItemRow'
import { TravelSegmentRow } from './TravelSegmentRow'
import { currentTimeInsertIndex } from './daily-itinerary'

export interface ItineraryDaySectionProps {
  day: TimelineDay
  canEdit: boolean
  onEdit: (entry: TimelineEntry) => void
  onToggleComplete: (entry: TimelineEntry) => void
  onMove: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
  /** Persist a new within-day order of the day's *items* (stop rows stay pinned). */
  onReorder: (day: TimelineDay, orderedItemIds: string[]) => void
  onAddToDay?: () => void
  /** Pause/resume realtime item sync while a drag is in flight. */
  onSyncPaused: (paused: boolean) => void
  selectedItemId?: string | null
  onSelectItem?: (id: string) => void
  /** Computes a route-optimization preview for this day (never mutates anything itself). */
  onOptimize?: () => void
  isOptimizing?: boolean
  variant?: 'plan' | 'daily'
  showCurrentTime?: boolean
  currentTime?: Date
}

function SortableRow({ entry, children }: {
  entry: TimelineEntry
  children: (p: { handleProps: Record<string, unknown>; isDragging: boolean }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  return (
    <div ref={setNodeRef} style={{ transform: DndCSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}>
      {children({ handleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  )
}

/** One day's timeline: pinned route arrivals, then the reorderable item list. */
export function ItineraryDaySection({ day, canEdit, onEdit, onToggleComplete, onMove, onDelete, onReorder, onAddToDay, onSyncPaused, selectedItemId, onSelectItem, onOptimize, isOptimizing, variant = 'plan', showCurrentTime = false, currentTime = new Date() }: ItineraryDaySectionProps) {
  const sensors = useSensors(
    // Small pointer distance / touch long-press so buttons inside rows keep
    // working as taps; keyboard sensor preserves non-pointer reordering.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const pinned = useMemo(() => day.entries.filter((entry) => entry.source === 'stop'), [day.entries])
  const sortable = useMemo(() => day.entries.filter((entry) => entry.source === 'item'), [day.entries])
  const nowInsertIndex = showCurrentTime ? currentTimeInsertIndex(day.entries, currentTime) : -1
  const nowBeforeKey = nowInsertIndex >= 0 && nowInsertIndex < day.entries.length ? day.entries[nowInsertIndex].key : null

  const nowMarker = (
    <div role="separator" aria-label="Current time" style={{ position: 'relative', minHeight: 30, marginLeft: variant === 'daily' ? 0 : 40, display: 'flex', alignItems: 'center', gap: 9, color: '#f5a623' }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: variant === 'daily' ? 20 : 0, width: 12, height: 12, borderRadius: '50%', background: '#f5a623', border: '3px solid #3b2a17', boxShadow: '0 0 12px rgba(245,166,35,.55)' }} />
      <span aria-hidden="true" style={{ marginLeft: variant === 'daily' ? 47 : 18, height: 1, flex: 1, background: 'linear-gradient(90deg, rgba(245,166,35,.7), rgba(245,166,35,.12))' }} />
      <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 850, letterSpacing: '.035em', textTransform: 'uppercase' }}>Now · {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    </div>
  )

  const handleDragEnd = (event: DragEndEvent) => {
    onSyncPaused(false)
    if (!canEdit) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortable.findIndex((entry) => entry.id === active.id)
    const newIndex = sortable.findIndex((entry) => entry.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(day, arrayMove(sortable, oldIndex, newIndex).map((entry) => entry.id))
  }

  const renderRow = (entry: TimelineEntry, previous: TimelineEntry | null, handleProps?: Record<string, unknown>, isDragging?: boolean) => (
    <>
      {showCurrentTime && nowBeforeKey === entry.key && nowMarker}
      {previous && previous.lat != null && previous.lng != null && entry.lat != null && entry.lng != null && (
        <TravelSegmentRow fromLat={previous.lat} fromLng={previous.lng} toLat={entry.lat} toLng={entry.lng} variant={variant} />
      )}
      <ItineraryItemRow
        entry={entry}
        canEdit={canEdit}
        onEdit={onEdit}
        onToggleComplete={onToggleComplete}
        onMove={onMove}
        onDelete={onDelete}
        dragHandleProps={handleProps}
        isDragging={isDragging}
        selected={selectedItemId === entry.key}
        onSelect={() => onSelectItem?.(entry.key)}
        variant={variant}
      />
    </>
  )

  if (day.entries.length === 0) {
    return (
      <EmptyState
        title="Nothing planned yet"
        description={canEdit ? 'Add an activity, stay, or note to this day.' : 'An editor can fill this day in.'}
        style={{ minHeight: 150 }}
        action={canEdit && onAddToDay ? (
          <button
            type="button"
            onClick={onAddToDay}
            style={{
              padding: '10px 20px', borderRadius: tokens.radius12, cursor: 'pointer', fontFamily: 'inherit',
              background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)',
              color: tokens.textPrimary, fontWeight: 700, fontSize: 13,
            }}
          >
            Add to this day
          </button>
        ) : undefined}
      />
    )
  }

  return (
    <div role="list" aria-label="Itinerary activities" style={{ display: 'flex', flexDirection: 'column', gap: variant === 'daily' ? 10 : 12 }}>
      {canEdit && onOptimize && (
        <button
          type="button"
          onClick={onOptimize}
          disabled={isOptimizing}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 40, padding: '8px 16px', borderRadius: tokens.radius12,
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
            cursor: isOptimizing ? 'default' : 'pointer', fontFamily: 'inherit',
            opacity: isOptimizing ? 0.6 : 1, alignSelf: 'flex-start',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: tokens.textPrimary }}>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          </svg>
          <span style={{ color: tokens.textPrimary, fontWeight: 700, fontSize: 12.5 }}>
            {isOptimizing ? 'Optimizing…' : 'Optimize day'}
          </span>
        </button>
      )}
      {pinned.map((entry, index) => (
        <div key={entry.key} role="listitem">
          {renderRow(entry, index > 0 ? pinned[index - 1] : null)}
        </div>
      ))}
      <DndContext
        id={`itinerary-day-${day.date ?? day.dayNumber ?? 'undated'}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onSyncPaused(true)}
        onDragCancel={() => onSyncPaused(false)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortable.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: variant === 'daily' ? 10 : 12 }}>
            {sortable.map((entry, index) => (
              <div key={entry.key} role="listitem">
                <SortableRow entry={entry}>
                  {({ handleProps, isDragging }) => renderRow(
                    entry,
                    index > 0 ? sortable[index - 1] : pinned.length > 0 ? pinned[pinned.length - 1] : null,
                    handleProps,
                    isDragging,
                  )}
                </SortableRow>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {showCurrentTime && nowInsertIndex === day.entries.length && nowMarker}
    </div>
  )
}
