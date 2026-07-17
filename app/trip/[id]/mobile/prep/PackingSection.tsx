'use client'

/**
 * Packing checklist: filter chips, category accordions, quick-check rows with
 * assignee/quantity/priority badges, inline quick-add, and in-category
 * reordering (drag on touch/pointer, space+arrows on the keyboard handle).
 */

import { useMemo, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { FilterChip, StatusChip, tokens } from '@/components/mobile'
import type { TripMember } from '@/types'
import { ACCENT, ACCENT_LIGHT } from '../domain-ui'
import {
  comparePackingRows, filterPackingItems, isOverdue,
  type PackingCategoryKey, type PackingFilter, type PackingItemRow,
} from './prep-logic'
import { AssigneeBadge, PACKING_CATEGORY_META, PriorityChip } from './prep-data'

const FILTERS: { key: PackingFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'remaining', label: 'Remaining' },
]

export interface PackingSectionProps {
  items: PackingItemRow[]
  members: TripMember[]
  currentUserId: string
  canEdit: boolean
  filter: PackingFilter
  onFilterChange: (filter: PackingFilter) => void
  onToggle: (item: PackingItemRow) => void
  onQuickAdd: (category: PackingCategoryKey, label: string) => void
  onOpenDetail: (item: PackingItemRow) => void
  /** Move within a category; ids reference the category's fully sorted list. */
  onReorder: (category: PackingCategoryKey, activeId: string, overId: string) => void
}

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function SortableItemRow({ id, disabled, children }: {
  id: string
  disabled: boolean
  children: (p: { handleProps: Record<string, unknown> | null; isDragging: boolean }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div ref={setNodeRef} style={{ transform: DndCSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}>
      {children({ handleProps: disabled ? null : { ...attributes, ...listeners }, isDragging })}
    </div>
  )
}

export function PackingSection({
  items, members, currentUserId, canEdit, filter, onFilterChange,
  onToggle, onQuickAdd, onOpenDetail, onReorder,
}: PackingSectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ clothing: true })
  const [draft, setDraft] = useState<Record<string, string>>({})
  const today = useMemo(() => localToday(), [])

  const sensors = useSensors(
    // Small pointer distance / touch long-press so checks and row taps keep
    // working; the keyboard sensor is the non-pointer reordering alternative.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const grouped = useMemo(() => {
    const byCategory = {} as Record<PackingCategoryKey, PackingItemRow[]>
    for (const meta of PACKING_CATEGORY_META) byCategory[meta.key] = []
    for (const item of items) (byCategory[item.category] ?? byCategory.other).push(item)
    for (const meta of PACKING_CATEGORY_META) byCategory[meta.key].sort(comparePackingRows)
    return byCategory
  }, [items])

  // Reordering a filtered subset would silently jump hidden neighbors, so the
  // drag affordance only exists in the unfiltered view.
  const canReorder = canEdit && filter === 'all'

  const submitDraft = (category: PackingCategoryKey) => {
    const label = (draft[category] ?? '').trim()
    if (!label) return
    setDraft((d) => ({ ...d, [category]: '' }))
    onQuickAdd(category, label)
  }

  const filterCounts = useMemo(() => Object.fromEntries(
    FILTERS.map(({ key }) => [key, filterPackingItems(items, key, currentUserId).length]),
  ) as Record<PackingFilter, number>, [items, currentUserId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div role="group" aria-label="Filter packing items" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
        {FILTERS.map(({ key, label }) => (
          <FilterChip key={key} selected={filter === key} onClick={() => onFilterChange(key)} style={{ flex: 'none' }}>
            {label}{key === 'all' ? '' : ` · ${filterCounts[key]}`}
          </FilterChip>
        ))}
      </div>

      {PACKING_CATEGORY_META.map(({ key, label, icon }) => {
        const fullList = grouped[key]
        const visible = filterPackingItems(fullList, filter, currentUserId)
        const checkedCount = fullList.filter((item) => item.checked).length
        const isOpen = !!expanded[key]
        return (
          <section key={key} aria-label={`${label} packing category`} style={{ background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}`, borderRadius: 20, boxShadow: '0 6px 20px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
              aria-expanded={isOpen}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 16, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 12, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                {icon(ACCENT_LIGHT)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11.5, color: tokens.textMuted, fontWeight: 500, marginTop: 1 }}>
                  {checkedCount}/{fullList.length} packed{filter !== 'all' ? ` · ${visible.length} shown` : ''}
                </div>
              </div>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {visible.length === 0 && fullList.length > 0 && (
                  <div style={{ padding: '10px 12px', fontSize: 12.5, color: tokens.textMuted, fontWeight: 500 }}>
                    Nothing matches this filter.
                  </div>
                )}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event
                    if (!over || active.id === over.id) return
                    onReorder(key, String(active.id), String(over.id))
                  }}
                >
                  <SortableContext items={visible.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {visible.map((item) => {
                        const overdue = !item.checked && isOverdue(item.due_date, today)
                        return (
                          <SortableItemRow key={item.id} id={item.id} disabled={!canReorder}>
                            {({ handleProps, isDragging }) => (
                              <div
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  borderRadius: 12,
                                  background: item.checked ? 'rgba(74,222,128,.08)' : 'rgba(255,255,255,.035)',
                                  border: overdue ? '1px solid rgba(239,68,68,.35)' : '1px solid transparent',
                                  boxShadow: isDragging ? '0 10px 26px rgba(0,0,0,.4)' : undefined,
                                }}
                              >
                                <button
                                  onClick={() => onToggle(item)}
                                  disabled={!canEdit}
                                  aria-label={item.checked ? `Uncheck ${item.label}` : `Check ${item.label}`}
                                  style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : .75, padding: 0 }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{ width: 20, height: 20, borderRadius: '50%', border: item.checked ? 'none' : '1.5px solid rgba(215,215,255,.35)', background: item.checked ? 'linear-gradient(145deg,#4ade80,#22c55e)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    {item.checked && (
                                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#06210f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    )}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenDetail(item)}
                                  aria-label={`Open details for ${item.label}`}
                                  style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}
                                >
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: item.checked ? 'rgba(215,215,255,.55)' : 'rgba(255,255,255,.92)', textDecoration: item.checked ? 'line-through' : 'none' }}>
                                      {item.label}
                                      {(item.quantity ?? 1) > 1 && (
                                        <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 700, color: tokens.textSecondary, textDecoration: 'none' }}>×{item.quantity}</span>
                                      )}
                                    </span>
                                    {(item.assigned_to || item.priority === 'high' || item.priority === 'low' || item.due_date) && (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, minWidth: 0 }}>
                                        <AssigneeBadge userId={item.assigned_to} members={members} currentUserId={currentUserId} />
                                        <PriorityChip priority={item.priority} />
                                        {item.due_date && (
                                          <StatusChip tone={overdue ? 'danger' : 'neutral'} style={{ padding: '2px 8px', fontSize: 10.5 }}>
                                            {overdue ? 'Overdue' : 'Due'} {item.due_date.slice(5)}
                                          </StatusChip>
                                        )}
                                      </span>
                                    )}
                                  </span>
                                </button>
                                {handleProps && (
                                  <button
                                    type="button"
                                    aria-label={`Reorder ${item.label}`}
                                    {...handleProps}
                                    style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'none', border: 'none', cursor: 'grab', color: 'rgba(215,215,255,.4)', touchAction: 'none' }}
                                  >
                                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
                                      <path d="M3 5.5H13M3 8H13M3 10.5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </SortableItemRow>
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <input
                      aria-label={`Add item to ${label}`}
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitDraft(key) }}
                      onFocus={(e) => {
                        // Keep the input (and its add button) above the on-screen keyboard.
                        const target = e.target
                        setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
                      }}
                      placeholder="Add item..."
                      style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '11px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                      aria-label={`Add item to ${label}`}
                      onClick={() => submitDraft(key)}
                      style={{ width: 44, height: 44, borderRadius: 10, background: tokens.glassStandardFill, border: `1px solid ${tokens.glassStandardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
