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
export function ItineraryDaySection({ day, canEdit, onEdit, onToggleComplete, onMove, onDelete, onReorder, onAddToDay, onSyncPaused, selectedItemId, onSelectItem }: ItineraryDaySectionProps) {
  const sensors = useSensors(
    // Small pointer distance / touch long-press so buttons inside rows keep
    // working as taps; keyboard sensor preserves non-pointer reordering.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const pinned = useMemo(() => day.entries.filter((entry) => entry.source === 'stop'), [day.entries])
  const sortable = useMemo(() => day.entries.filter((entry) => entry.source === 'item'), [day.entries])

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
      {previous && previous.lat != null && previous.lng != null && entry.lat != null && entry.lng != null && (
        <TravelSegmentRow fromLat={previous.lat} fromLng={previous.lng} toLat={entry.lat} toLng={entry.lng} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pinned.map((entry, index) => (
        <div key={entry.key}>
          {renderRow(entry, index > 0 ? pinned[index - 1] : null)}
        </div>
      ))}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onSyncPaused(true)}
        onDragCancel={() => onSyncPaused(false)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortable.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortable.map((entry, index) => (
              <SortableRow key={entry.key} entry={entry}>
                {({ handleProps, isDragging }) => renderRow(
                  entry,
                  index > 0 ? sortable[index - 1] : pinned.length > 0 ? pinned[pinned.length - 1] : null,
                  handleProps,
                  isDragging,
                )}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
