'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  GripVertical,
  Clock,
  DollarSign,
  Navigation,
  Trash2,
  Loader2,
  Sparkles,
} from 'lucide-react'
import type { Stop } from '@/types'
import { ACTIVITY_CATEGORY_CONFIG } from '@/types'
import { useStopActivities, type ActivityWithMeta } from '@/hooks/use-stop-activities'
import { ActivityQuickAddSheet } from './activity-quick-add-sheet'

/* ── Props ───────────────────────────────────────────────────── */

interface StopActivityPlannerProps {
  stop: Stop
  tripId: string
  currentUserId: string
  isExpanded: boolean
}

/* ── Main component ──────────────────────────────────────────── */

export function StopActivityPlanner({
  stop,
  tripId,
  currentUserId,
  isExpanded,
}: StopActivityPlannerProps) {
  const { state, load, add, reorder, persistOrder, remove } = useStopActivities(stop.id)
  const [showAddSheet, setShowAddSheet] = useState(false)

  // Lazy-load on first expand
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (isExpanded && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      load()
    }
  }, [isExpanded, load])

  // DnD sensors — higher distance threshold to avoid conflicts with stop-level DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIdx = state.items.findIndex((i) => i.id === active.id)
      const newIdx = state.items.findIndex((i) => i.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return
      reorder(oldIdx, newIdx)
      persistOrder(arrayMove(state.items, oldIdx, newIdx))
    },
    [state.items, reorder, persistOrder]
  )

  // Summary totals
  const summary = useMemo(() => {
    const totalMins = state.items.reduce((s, a) => s + (a.duration_mins ?? 0), 0)
    const totalKm =
      Math.round(
        state.items.reduce((s, a) => s + (a.distanceToNextKm ?? 0), 0) * 10
      ) / 10
    const totalCost = state.items.reduce((s, a) => s + (a.estimated_cost ?? 0), 0)
    return { totalMins, totalKm, totalCost }
  }, [state.items])

  return (
    <>
      {/* CSS grid trick: 0fr ↔ 1fr for smooth height animation */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mx-4 mb-1 rounded-b-xl border border-t-0 border-border/30 bg-muted/10">

            {/* ── Loading skeleton ──────────────────────── */}
            {state.isLoading && (
              <div className="flex items-center gap-2 px-5 py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground/50">Loading…</span>
              </div>
            )}

            {/* ── Activity timeline ─────────────────────── */}
            {state.isLoaded && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={state.items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="px-4 pt-3">
                    {state.items.length === 0 ? (
                      <EmptyHint />
                    ) : (
                      state.items.map((activity, idx) => (
                        <SortableActivityItem
                          key={activity.id}
                          activity={activity}
                          isLast={idx === state.items.length - 1}
                          onDelete={() => remove(activity.id)}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* ── Bottom bar: Add + Summary ─────────────── */}
            <div className="flex items-center justify-between px-4 py-2">
              <button
                onClick={() => {
                  if (!state.isLoaded) load()
                  setShowAddSheet(true)
                }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add activity
              </button>

              {state.items.length > 0 && (
                <div className="flex items-center gap-3">
                  {summary.totalMins > 0 && (
                    <SummaryChip icon={<Clock className="h-3 w-3" />}>
                      {summary.totalMins >= 60
                        ? `${Math.floor(summary.totalMins / 60)}h${summary.totalMins % 60 ? ` ${summary.totalMins % 60}m` : ''}`
                        : `${summary.totalMins}m`}
                    </SummaryChip>
                  )}
                  {summary.totalKm > 0 && (
                    <SummaryChip icon={<Navigation className="h-3 w-3" />}>
                      {summary.totalKm} km
                    </SummaryChip>
                  )}
                  {summary.totalCost > 0 && (
                    <SummaryChip icon={<DollarSign className="h-3 w-3" />}>
                      ${summary.totalCost}
                    </SummaryChip>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <ActivityQuickAddSheet
        open={showAddSheet}
        stop={stop}
        tripId={tripId}
        currentUserId={currentUserId}
        existingCount={state.items.length}
        onClose={() => setShowAddSheet(false)}
        onAdd={add}
      />
    </>
  )
}

/* ── SortableActivityItem ────────────────────────────────────── */

function SortableActivityItem({
  activity,
  isLast,
  onDelete,
}: {
  activity: ActivityWithMeta
  isLast: boolean
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: activity.id })

  const cfg = ACTIVITY_CATEGORY_CONFIG[activity.category]

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="group/act relative flex items-start gap-2">

      {/* Drag handle — appears on hover */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="mt-1.5 shrink-0 cursor-grab touch-none text-muted-foreground/20 opacity-0 transition-opacity group-hover/act:opacity-100 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Timeline: category dot + connector line */}
      <div className="flex shrink-0 flex-col items-center">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
          style={{
            backgroundColor: cfg.color + '28',
            border: `1.5px solid ${cfg.color}55`,
          }}
        >
          {cfg.icon}
        </div>
        {!isLast && (
          <div className="my-0.5 w-px bg-border/30" style={{ minHeight: 18 }} />
        )}
      </div>

      {/* Content */}
      <div className={`min-w-0 flex-1 ${isLast ? 'pb-1' : 'pb-3'}`}>

        {/* Name row */}
        <div className="flex items-center gap-1.5">
          {activity.time_of_day && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
              {activity.time_of_day}
            </span>
          )}
          <span className="truncate text-sm font-semibold text-foreground">
            {activity.name}
          </span>

          {/* Delete — hover only */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/20 opacity-0 transition-all group-hover/act:opacity-100 hover:!text-destructive"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Metadata pills */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {activity.duration_mins != null && activity.duration_mins > 0 && (
            <MetaPill>
              <Clock className="h-3 w-3" />
              {activity.duration_mins >= 60
                ? `${Math.floor(activity.duration_mins / 60)}h${activity.duration_mins % 60 ? ` ${activity.duration_mins % 60}m` : ''}`
                : `${activity.duration_mins}m`}
            </MetaPill>
          )}
          {activity.estimated_cost != null && activity.estimated_cost > 0 && (
            <MetaPill>
              <DollarSign className="h-3 w-3" />${activity.estimated_cost}
            </MetaPill>
          )}
          {!isLast && activity.distanceToNextKm != null && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/35">
              <Navigation className="h-3 w-3" />
              {activity.distanceToNextKm} km →
            </span>
          )}
        </div>

        {activity.notes && (
          <p className="mt-1 line-clamp-1 text-[10px] italic text-muted-foreground/45">
            {activity.notes}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Small helpers ───────────────────────────────────────────── */

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground/70">
      {children}
    </span>
  )
}

function SummaryChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/55">
      {icon}
      {children}
    </span>
  )
}

function EmptyHint() {
  return (
    <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground/40">
      <Sparkles className="h-3.5 w-3.5" />
      No activities yet
    </div>
  )
}
