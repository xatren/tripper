'use client'

/**
 * Bottom sheets for the Trip Readiness center:
 *  - PrepDetailSheet: edit a packing item or prep task (assignee, quantity,
 *    priority, due date, scope, notes) with a remote-conflict indicator.
 *  - TemplatePickerSheet: vibe-aware starter list with preview, per-item
 *    selection, and duplicate flagging (idempotent by default).
 */

import { useEffect, useMemo, useState } from 'react'
import { FilterChip, MobileBottomSheet, StatusChip, tokens } from '@/components/mobile'
import type { TripMember } from '@/types'
import { ACCENT_GRADIENT } from '../domain-ui'
import {
  assigneeInfo, memberDisplayName, partitionTemplate,
  type PackingItemRow, type PackingScope, type PrepPriority,
  type TemplateRow, type TripTaskRow,
} from './prep-logic'
import { buildTemplateRows, PACKING_CATEGORY_LABEL, PACKING_CATEGORY_META, PRIORITY_META, VIBE_PACKING_EMOJI } from './prep-data'

const fieldLabelStyle = {
  display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
} as const

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 12, padding: '12px 12px', fontSize: 14, color: '#fff', outline: 'none',
  fontFamily: 'inherit', minHeight: 44, boxSizing: 'border-box',
} as const

// ── Assignee picker (inline in the detail sheet) ─────────────────────────────

function AssigneePicker({ members, currentUserId, value, onChange, disabled }: {
  members: TripMember[]
  currentUserId: string
  value: string | null
  onChange: (userId: string | null) => void
  disabled: boolean
}) {
  const departed = value ? assigneeInfo(value, members, currentUserId)?.departed : false
  return (
    <div role="group" aria-label="Assign to member" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {departed && (
        <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.28)', fontSize: 12, color: tokens.warning, fontWeight: 600 }}>
          Assigned to someone who left this trip. Pick a current member to reassign.
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <FilterChip selected={value === null} disabled={disabled} onClick={() => onChange(null)}>
          Unassigned
        </FilterChip>
        {members.map((member) => (
          <FilterChip
            key={member.user_id}
            selected={value === member.user_id}
            disabled={disabled}
            onClick={() => onChange(member.user_id)}
          >
            {memberDisplayName(member, currentUserId)}
          </FilterChip>
        ))}
      </div>
    </div>
  )
}

// ── Detail sheet ─────────────────────────────────────────────────────────────

export type DetailTarget =
  | { kind: 'packing'; row: PackingItemRow }
  | { kind: 'task'; row: TripTaskRow }

export interface PrepDetailSheetProps {
  target: DetailTarget | null
  members: TripMember[]
  currentUserId: string
  canEdit: boolean
  onClose: () => void
  onSavePacking: (id: string, patch: Partial<PackingItemRow>) => Promise<boolean>
  onSaveTask: (id: string, patch: Partial<TripTaskRow>) => Promise<boolean>
  onDeletePacking: (row: PackingItemRow) => void
  onDeleteTask: (row: TripTaskRow) => void
}

interface DetailFormState {
  name: string
  quantity: number
  priority: PrepPriority
  dueDate: string
  scope: PackingScope
  notes: string
  assignedTo: string | null
}

function formFromTarget(target: DetailTarget): DetailFormState {
  if (target.kind === 'packing') {
    const row = target.row
    return {
      name: row.label,
      quantity: row.quantity ?? 1,
      priority: row.priority ?? 'normal',
      dueDate: row.due_date ?? '',
      scope: row.scope ?? 'everyone',
      notes: row.notes ?? '',
      assignedTo: row.assigned_to ?? null,
    }
  }
  const row = target.row
  return {
    name: row.title,
    quantity: 1,
    priority: row.priority ?? 'normal',
    dueDate: row.due_date ?? '',
    scope: 'everyone',
    notes: row.notes ?? '',
    assignedTo: row.assigned_to ?? null,
  }
}

const SCOPE_META: { key: PackingScope; label: string; hint: string }[] = [
  { key: 'everyone', label: 'Everyone', hint: 'Each traveler brings their own' },
  { key: 'personal', label: 'Personal', hint: 'Just for the assignee' },
  { key: 'shared', label: 'Shared', hint: 'One for the whole group' },
]

export function PrepDetailSheet({
  target, members, currentUserId, canEdit, onClose,
  onSavePacking, onSaveTask, onDeletePacking, onDeleteTask,
}: PrepDetailSheetProps) {
  const [form, setForm] = useState<DetailFormState | null>(null)
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const targetId = target?.row.id ?? null

  // (Re)initialize the form whenever the sheet opens for a different row.
  useEffect(() => {
    if (!target) {
      setForm(null)
      setBaselineUpdatedAt(undefined)
      setConfirmDelete(false)
      return
    }
    setForm(formFromTarget(target))
    setBaselineUpdatedAt(target.row.updated_at)
    setConfirmDelete(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinit only per row identity, not per remote refresh
  }, [targetId])

  // Live row drifting under the open form = a teammate edited it. Never
  // silently clobber the user's inputs; surface it and offer a manual reload.
  const remoteConflict = !!target && !!baselineUpdatedAt && !!target.row.updated_at
    && target.row.updated_at !== baselineUpdatedAt

  if (!target || !form) {
    return <MobileBottomSheet open={false} onClose={onClose} title="Item details"><div /></MobileBottomSheet>
  }

  const isPacking = target.kind === 'packing'
  const heading = isPacking
    ? `${PACKING_CATEGORY_LABEL[target.row.category as PackingItemRow['category']] ?? 'Packing'} item`
    : 'Prep task'

  const save = async () => {
    if (!canEdit || saving) return
    const name = form.name.trim()
    if (!name) return
    setSaving(true)
    let ok: boolean
    if (isPacking) {
      ok = await onSavePacking(target.row.id, {
        label: name,
        quantity: Math.min(99, Math.max(1, Math.round(form.quantity))),
        priority: form.priority,
        due_date: form.dueDate || null,
        scope: form.scope,
        notes: form.notes.trim() || null,
        assigned_to: form.assignedTo,
      })
    } else {
      ok = await onSaveTask(target.row.id, {
        title: name,
        priority: form.priority,
        due_date: form.dueDate || null,
        notes: form.notes.trim() || null,
        assigned_to: form.assignedTo,
      })
    }
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <MobileBottomSheet open onClose={onClose} title={heading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {remoteConflict && (
          <div role="status" style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(96,165,250,.1)', border: '1px solid rgba(96,165,250,.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: tokens.info, fontWeight: 600, flex: 1 }}>
              A teammate updated this item while you were editing.
            </span>
            <button
              type="button"
              onClick={() => {
                setForm(formFromTarget(target))
                setBaselineUpdatedAt(target.row.updated_at)
              }}
              style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, background: 'rgba(96,165,250,.16)', border: '1px solid rgba(96,165,250,.4)', color: tokens.info, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}
            >
              Load latest
            </button>
          </div>
        )}

        <div>
          <label htmlFor="prep-detail-name" style={fieldLabelStyle}>{isPacking ? 'Item' : 'Task'}</label>
          <input
            id="prep-detail-name"
            value={form.name}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
            style={inputStyle}
          />
        </div>

        {isPacking && (
          <div>
            <span style={fieldLabelStyle} id="prep-detail-qty-label">Quantity</span>
            <div role="group" aria-labelledby="prep-detail-qty-label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={!canEdit || form.quantity <= 1}
                onClick={() => setForm((f) => f && { ...f, quantity: Math.max(1, f.quantity - 1) })}
                style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: form.quantity <= 1 ? .45 : 1 }}
              >
                −
              </button>
              <span aria-live="polite" style={{ minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: 800 }}>{form.quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={!canEdit || form.quantity >= 99}
                onClick={() => setForm((f) => f && { ...f, quantity: Math.min(99, f.quantity + 1) })}
                style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: form.quantity >= 99 ? .45 : 1 }}
              >
                +
              </button>
            </div>
          </div>
        )}

        <div>
          <span style={fieldLabelStyle} id="prep-detail-priority-label">Priority</span>
          <div role="group" aria-labelledby="prep-detail-priority-label" style={{ display: 'flex', gap: 8 }}>
            {PRIORITY_META.map(({ key, label }) => (
              <FilterChip key={key} selected={form.priority === key} disabled={!canEdit} onClick={() => setForm((f) => f && { ...f, priority: key })}>
                {label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="prep-detail-due" style={fieldLabelStyle}>Due date</label>
          <input
            id="prep-detail-due"
            type="date"
            value={form.dueDate}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => f && { ...f, dueDate: e.target.value })}
            style={{ ...inputStyle, colorScheme: 'dark' }}
          />
        </div>

        {isPacking && (
          <div>
            <span style={fieldLabelStyle} id="prep-detail-scope-label">Scope</span>
            <div role="group" aria-labelledby="prep-detail-scope-label" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SCOPE_META.map(({ key, label }) => (
                <FilterChip key={key} selected={form.scope === key} disabled={!canEdit} onClick={() => setForm((f) => f && { ...f, scope: key })}>
                  {label}
                </FilterChip>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: tokens.textMuted, fontWeight: 500 }}>
              {SCOPE_META.find((s) => s.key === form.scope)?.hint}
            </div>
          </div>
        )}

        <div>
          <span style={fieldLabelStyle}>Assignee</span>
          <AssigneePicker
            members={members}
            currentUserId={currentUserId}
            value={form.assignedTo}
            onChange={(userId) => setForm((f) => f && { ...f, assignedTo: userId })}
            disabled={!canEdit}
          />
        </div>

        <div>
          <label htmlFor="prep-detail-notes" style={fieldLabelStyle}>Notes</label>
          <textarea
            id="prep-detail-notes"
            value={form.notes}
            disabled={!canEdit}
            rows={2}
            maxLength={2000}
            onChange={(e) => setForm((f) => f && { ...f, notes: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </div>

        {canEdit ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }
                if (isPacking) onDeletePacking(target.row)
                else onDeleteTask(target.row)
                onClose()
              }}
              style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', color: tokens.danger, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}
            >
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !form.name.trim()}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: ACCENT_GRADIENT, border: 'none', color: '#1a0800', fontSize: 14, fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving || !form.name.trim() ? .6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: tokens.textMuted, fontWeight: 500 }}>
            You have view-only access to this trip.
          </div>
        )}
      </div>
    </MobileBottomSheet>
  )
}

// ── Template picker ──────────────────────────────────────────────────────────

export interface TemplatePickerSheetProps {
  open: boolean
  vibe: string | null | undefined
  existingItems: Pick<PackingItemRow, 'category' | 'label'>[]
  onClose: () => void
  /** Resolves true on success (sheet closes itself then). */
  onImport: (rows: TemplateRow[]) => Promise<boolean>
}

export function TemplatePickerSheet({ open, vibe, existingItems, onClose, onImport }: TemplatePickerSheetProps) {
  const template = useMemo(() => buildTemplateRows(vibe), [vibe])
  const { fresh, duplicates } = useMemo(() => partitionTemplate(template, existingItems), [template, existingItems])
  const duplicateKeys = useMemo(() => new Set(duplicates.map((row) => `${row.category}|${row.label}`)), [duplicates])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  // Fresh rows preselected on open; duplicates opt-in only.
  useEffect(() => {
    if (open) setSelected(new Set(fresh.map((row) => `${row.category}|${row.label}`)))
  }, [open, fresh])

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const runImport = async () => {
    if (importing || selected.size === 0) return
    setImporting(true)
    const rows = template.filter((row) => selected.has(`${row.category}|${row.label}`))
    const ok = await onImport(rows)
    setImporting(false)
    if (ok) onClose()
  }

  return (
    <MobileBottomSheet open={open} onClose={onClose} title={`${VIBE_PACKING_EMOJI[vibe ?? 'Road'] ?? '🧳'} ${vibe ?? 'Trip'} starter list`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 12.5, color: tokens.textSecondary, fontWeight: 500, lineHeight: 1.5 }}>
          Suggested for your {vibe ?? 'trip'} — review and import only what you need.
          {duplicates.length > 0 && ' Items already on your list are unchecked so you don’t import them twice.'}
        </div>
        {PACKING_CATEGORY_META.map(({ key, label }) => {
          const rows = template.filter((row) => row.category === key)
          if (rows.length === 0) return null
          return (
            <div key={key}>
              <div style={{ fontSize: 12, fontWeight: 800, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rows.map((row) => {
                  const rowKey = `${row.category}|${row.label}`
                  const isDuplicate = duplicateKeys.has(rowKey)
                  const isSelected = selected.has(rowKey)
                  return (
                    <button
                      key={rowKey}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => toggle(rowKey)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '4px 8px', borderRadius: 10, background: isSelected ? 'rgba(245,166,35,.09)' : 'transparent', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ width: 18, height: 18, borderRadius: 6, flex: 'none', border: isSelected ? 'none' : '1.5px solid rgba(215,215,255,.35)', background: isSelected ? ACCENT_GRADIENT : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#1a0800" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{row.label}</span>
                      {isDuplicate && (
                        <StatusChip tone="warning" style={{ padding: '2px 8px', fontSize: 10.5 }}>Already added</StatusChip>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        <button
          type="button"
          onClick={runImport}
          disabled={importing || selected.size === 0}
          style={{ minHeight: 48, borderRadius: 12, background: ACCENT_GRADIENT, border: 'none', color: '#1a0800', fontSize: 14, fontWeight: 800, cursor: importing || selected.size === 0 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: importing || selected.size === 0 ? .6 : 1, boxShadow: '0 0 20px rgba(245,140,0,.25)' }}
        >
          {importing ? 'Importing…' : `Import ${selected.size} item${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </MobileBottomSheet>
  )
}
