'use client'

/**
 * Non-packing prep checklists (Reservations, Documents, Payments, Vehicle,
 * Custom) backed by `trip_tasks`. Same row anatomy as packing minus
 * quantity/scope; tasks open the shared detail sheet for assignment, priority,
 * due date, and notes.
 */

import { useMemo, useState } from 'react'
import { StatusChip, tokens } from '@/components/mobile'
import type { TripMember } from '@/types'
import { ACCENT, ACCENT_LIGHT } from '../domain-ui'
import {
  comparePackingRows, isOverdue,
  type TripTaskCategory, type TripTaskRow,
} from './prep-logic'
import { AssigneeBadge, PriorityChip, TASK_CATEGORY_META } from './prep-data'

export interface TaskSectionProps {
  tasks: TripTaskRow[]
  members: TripMember[]
  currentUserId: string
  canEdit: boolean
  onToggle: (task: TripTaskRow) => void
  onQuickAdd: (category: Exclude<TripTaskCategory, 'packing'>, title: string) => void
  onOpenDetail: (task: TripTaskRow) => void
}

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function TaskSection({ tasks, members, currentUserId, canEdit, onToggle, onQuickAdd, onOpenDetail }: TaskSectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const today = useMemo(() => localToday(), [])

  const grouped = useMemo(() => {
    const byCategory = new Map<string, TripTaskRow[]>()
    for (const meta of TASK_CATEGORY_META) byCategory.set(meta.key, [])
    for (const task of tasks) {
      // 'packing'-category tasks are reserved for future consolidation and are
      // not listed here; they still count toward packing readiness upstream.
      if (task.category === 'packing') continue
      const list = byCategory.get(task.category) ?? byCategory.get('custom')!
      list.push(task)
    }
    for (const list of byCategory.values()) list.sort(comparePackingRows)
    return byCategory
  }, [tasks])

  const submitDraft = (category: Exclude<TripTaskCategory, 'packing'>) => {
    const title = (draft[category] ?? '').trim()
    if (!title) return
    setDraft((d) => ({ ...d, [category]: '' }))
    onQuickAdd(category, title)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {TASK_CATEGORY_META.map(({ key, label, hint, icon }) => {
        const list = grouped.get(key) ?? []
        const doneCount = list.filter((task) => task.done).length
        const isOpen = !!expanded[key]
        return (
          <section key={key} aria-label={`${label} prep tasks`} style={{ background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}`, borderRadius: 20, boxShadow: '0 6px 20px rgba(0,0,0,.2)', overflow: 'hidden' }}>
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
                  {list.length === 0 ? hint : `${doneCount}/${list.length} done`}
                </div>
              </div>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.length === 0 && (
                  <div style={{ padding: '4px 12px 8px', fontSize: 12.5, color: tokens.textMuted, fontWeight: 500 }}>
                    {canEdit ? 'No tasks yet — add the first one below.' : 'No tasks yet.'}
                  </div>
                )}
                {list.map((task) => {
                  const overdue = !task.done && isOverdue(task.due_date, today)
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, borderRadius: 12,
                        background: task.done ? 'rgba(74,222,128,.08)' : 'rgba(255,255,255,.035)',
                        border: overdue ? '1px solid rgba(239,68,68,.35)' : '1px solid transparent',
                      }}
                    >
                      <button
                        onClick={() => onToggle(task)}
                        disabled={!canEdit}
                        aria-label={task.done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
                        style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : .75, padding: 0 }}
                      >
                        <span
                          aria-hidden="true"
                          style={{ width: 20, height: 20, borderRadius: '50%', border: task.done ? 'none' : '1.5px solid rgba(215,215,255,.35)', background: task.done ? 'linear-gradient(145deg,#4ade80,#22c55e)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {task.done && (
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#06210f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(task)}
                        aria-label={`Open details for ${task.title}`}
                        style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 4px', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.done ? 'rgba(215,215,255,.55)' : 'rgba(255,255,255,.92)', textDecoration: task.done ? 'line-through' : 'none' }}>
                            {task.title}
                          </span>
                          {(task.assigned_to || task.priority !== 'normal' || task.due_date) && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, minWidth: 0 }}>
                              <AssigneeBadge userId={task.assigned_to} members={members} currentUserId={currentUserId} />
                              <PriorityChip priority={task.priority} />
                              {task.due_date && (
                                <StatusChip tone={overdue ? 'danger' : 'neutral'} style={{ padding: '2px 8px', fontSize: 10.5 }}>
                                  {overdue ? 'Overdue' : 'Due'} {task.due_date.slice(5)}
                                </StatusChip>
                              )}
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  )
                })}
                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <input
                      aria-label={`Add task to ${label}`}
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitDraft(key) }}
                      onFocus={(e) => {
                        const target = e.target
                        setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
                      }}
                      placeholder="Add task..."
                      style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '11px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                      aria-label={`Add task to ${label}`}
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
