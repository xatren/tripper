'use client'

/**
 * Trip Readiness center (Prep tab): readiness overview computed from real
 * packing + prep-task data, the shared packing checklist (assignees,
 * quantities, priorities, reorder, filters), non-packing prep sections backed
 * by `trip_tasks`, a "who brings what" summary, and a vibe-aware template
 * picker with idempotent import.
 *
 * Requires migration 20260717040000_trip_readiness for the collaboration
 * columns and the trip_tasks table; degrades to the legacy checklist shape
 * (label + checked only) when the new columns are missing.
 */

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { enqueueMutation } from '@/lib/offline/db'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { showToast } from '@/components/ui/toast'
import { tokens } from '@/components/mobile'
import type { TripMember } from '@/types'
import { ACCENT_DARK, ACCENT_GRADIENT, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL, RetryCard } from './domain-ui'
import {
  applyRealtimeChange, buildReadinessSections, comparePackingRows, computeReadiness,
  nextOrderIndex, reorderUpdates, whoBringsWhat,
  type PackingCategoryKey, type PackingFilter, type PackingItemRow,
  type TemplateRow, type TripTaskCategory, type TripTaskRow,
} from './prep/prep-logic'
import { hapticTap, READINESS_SECTION_LABEL, VIBE_PACKING_EMOJI } from './prep/prep-data'
import { PackingSection } from './prep/PackingSection'
import { TaskSection } from './prep/TaskSection'
import { PrepDetailSheet, TemplatePickerSheet, type DetailTarget } from './prep/PrepSheets'

// Session-lifetime caches so re-opening the Prep tab never refetches; every
// mutation below writes through them.
const packingCache = new Map<string, PackingItemRow[]>()
const tasksCache = new Map<string, TripTaskRow[]>()

/** Column-missing Postgres errors → the readiness migration isn't applied yet. */
function isMissingSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === '42P01'
    || /column .* does not exist|relation .* does not exist|schema cache/i.test(error.message ?? '')
}

export interface PrepDomainProps {
  tripId: string
  vibe?: string | null
  userId: string
  canEdit: boolean
  members: TripMember[]
}

export function PrepDomain({ tripId, vibe, userId, canEdit, members }: PrepDomainProps) {
  const [items, setItemsState] = useState<PackingItemRow[]>(() => packingCache.get(tripId) ?? [])
  const [tasks, setTasksState] = useState<TripTaskRow[]>(() => tasksCache.get(tripId) ?? [])
  const [loading, setLoading] = useState(() => !packingCache.has(tripId))
  const [loadError, setLoadError] = useState(false)
  const [tasksUnavailable, setTasksUnavailable] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [filter, setFilter] = useState<PackingFilter>('all')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [detail, setDetail] = useState<{ kind: 'packing' | 'task'; id: string } | null>(null)

  const setItems: Dispatch<SetStateAction<PackingItemRow[]>> = useCallback((action) =>
    setItemsState((prev) => {
      const next = typeof action === 'function' ? (action as (p: PackingItemRow[]) => PackingItemRow[])(prev) : action
      packingCache.set(tripId, next)
      return next
    }), [tripId])

  const setTasks: Dispatch<SetStateAction<TripTaskRow[]>> = useCallback((action) =>
    setTasksState((prev) => {
      const next = typeof action === 'function' ? (action as (p: TripTaskRow[]) => TripTaskRow[])(prev) : action
      tasksCache.set(tripId, next)
      return next
    }), [tripId])

  // ── Loading ────────────────────────────────────────────────────────────────

  const refreshItems = useCallback(async () => {
    const { data, error } = await createClient()
      .from('packing_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
    if (data) setItems(data as PackingItemRow[])
    return { data, error }
  }, [setItems, tripId])

  const refreshTasks = useCallback(async () => {
    const { data, error } = await createClient()
      .from('trip_tasks')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
    if (data) {
      setTasks(data as TripTaskRow[])
      setTasksUnavailable(false)
    } else if (isMissingSchemaError(error)) {
      setTasksUnavailable(true)
    }
    return { data, error }
  }, [setTasks, tripId])

  useEffect(() => {
    if (reloadToken === 0 && packingCache.has(tripId)) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    Promise.all([refreshItems(), refreshTasks()]).then(([packing, taskResult]) => {
      if (cancelled) return
      // Packing is the load-bearing query; tasks degrade gracefully when the
      // trip_tasks migration hasn't been applied yet.
      if (packing.data) setLoadError(false)
      else if (packing.error) setLoadError(true)
      if (taskResult.error && !isMissingSchemaError(taskResult.error) && !taskResult.data) {
        showToast("Couldn't load prep tasks.", 'error')
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refreshItems, refreshTasks, tripId, reloadToken])

  // ── Realtime ───────────────────────────────────────────────────────────────

  useTripRealtimeTable<PackingItemRow & Record<string, unknown>>(
    'packing_items',
    useCallback((change) => {
      setItems((previous) => applyRealtimeChange(previous, change as Parameters<typeof applyRealtimeChange<PackingItemRow>>[1]))
    }, [setItems]),
    useCallback(() => { void refreshItems() }, [refreshItems]),
  )

  useTripRealtimeTable<TripTaskRow & Record<string, unknown>>(
    'trip_tasks',
    useCallback((change) => {
      setTasks((previous) => applyRealtimeChange(previous, change as Parameters<typeof applyRealtimeChange<TripTaskRow>>[1]))
    }, [setTasks]),
    useCallback(() => { void refreshTasks() }, [refreshTasks]),
  )

  // ── Packing mutations (optimistic, rollback + toast on failure) ────────────

  const togglePacking = useCallback((row: PackingItemRow) => {
    if (!canEdit) return
    const nextChecked = !row.checked
    hapticTap()
    setItems((prev) => prev.map((item) => (item.id === row.id
      ? { ...item, checked: nextChecked, completed_by: nextChecked ? userId : null, completed_at: nextChecked ? new Date().toISOString() : null, _offline_status: navigator.onLine ? undefined : 'queued' }
      : item)))
    if (!navigator.onLine) {
      const completedAt = nextChecked ? new Date().toISOString() : null
      void enqueueMutation({
        user_id: userId, trip_id: tripId, entity: 'packing_item', action: 'toggle', entity_id: row.id,
        payload: { checked: nextChecked, completed_by: nextChecked ? userId : null, completed_at: completedAt },
        base_version: row.updated_at ?? null,
      }).then(() => showToast('Saved on this device · queued for sync.', 'info')).catch(() => {
        setItems((prev) => prev.map((item) => item.id === row.id ? { ...item, checked: row.checked, _offline_status: 'error' } : item))
        showToast("Couldn't queue this change.", 'error')
      })
      return
    }
    const supabase = createClient()
    const rollback = () => {
      setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, checked: row.checked, completed_by: row.completed_by ?? null, completed_at: row.completed_at ?? null } : item)))
      showToast("Couldn't update the item.", 'error')
    }
    supabase
      .from('packing_items')
      .update({ checked: nextChecked, completed_by: nextChecked ? userId : null, completed_at: nextChecked ? new Date().toISOString() : null })
      .eq('id', row.id)
      .then(({ error }) => {
        if (!error) return
        if (!isMissingSchemaError(error)) {
          rollback()
          return
        }
        // Pre-migration schema: fall back to the legacy checked-only write.
        supabase.from('packing_items').update({ checked: nextChecked }).eq('id', row.id).then(({ error: legacyError }) => {
          if (legacyError) rollback()
        })
      })
  }, [canEdit, setItems, tripId, userId])

  const quickAddPacking = useCallback(async (category: PackingCategoryKey, label: string) => {
    if (!canEdit) return
    if (!navigator.onLine) {
      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      const orderIndex = nextOrderIndex(items.filter((item) => item.category === category))
      const local = { id, trip_id: tripId, category, label, checked: false, created_by: userId, created_at: createdAt, order_index: orderIndex, _offline_status: 'queued' as const }
      setItems((previous) => [...previous, local])
      try {
        await enqueueMutation({ user_id: userId, trip_id: tripId, entity: 'packing_item', action: 'create', entity_id: id, payload: { id, trip_id: tripId, category, label, created_by: userId, order_index: orderIndex } })
        showToast('Item saved on this device · queued.', 'info')
      } catch {
        setItems((previous) => previous.filter((item) => item.id !== id))
        showToast("Couldn't queue the item.", 'error')
      }
      return
    }
    const supabase = createClient()
    const categoryItems = items.filter((item) => item.category === category)
    const insertRow = { trip_id: tripId, category, label, created_by: userId, order_index: nextOrderIndex(categoryItems) }
    let { data, error } = await supabase.from('packing_items').insert(insertRow).select().single()
    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await supabase
        .from('packing_items')
        .insert({ trip_id: tripId, category, label, created_by: userId })
        .select()
        .single())
    }
    if (!error && data) {
      const row = data as PackingItemRow
      setItems((prev) => prev.some((item) => item.id === row.id)
        ? prev.map((item) => (item.id === row.id ? row : item))
        : [...prev, row])
    } else {
      showToast("Couldn't add the item.", 'error')
    }
  }, [canEdit, items, setItems, tripId, userId])

  const savePackingPatch = useCallback(async (id: string, patch: Partial<PackingItemRow>) => {
    if (!canEdit) return false
    const { data, error } = await createClient()
      .from('packing_items')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error || !data) {
      showToast(
        isMissingSchemaError(error) ? 'Run migration 20260717040000 to edit item details.' : "Couldn't save the item.",
        'error',
      )
      return false
    }
    const row = data as PackingItemRow
    setItems((prev) => prev.map((item) => (item.id === id ? row : item)))
    return true
  }, [canEdit, setItems])

  const deletePacking = useCallback((row: PackingItemRow) => {
    if (!canEdit) return
    setItems((prev) => prev.filter((item) => item.id !== row.id))
    createClient().from('packing_items').delete().eq('id', row.id).then(({ error }) => {
      if (error) {
        setItems((prev) => (prev.some((item) => item.id === row.id) ? prev : [...prev, row]))
        showToast("Couldn't remove the item.", 'error')
      }
    })
  }, [canEdit, setItems])

  const reorderPacking = useCallback((category: PackingCategoryKey, activeId: string, overId: string) => {
    if (!canEdit) return
    const sorted = items.filter((item) => item.category === category).sort(comparePackingRows)
    const fromIndex = sorted.findIndex((item) => item.id === activeId)
    const toIndex = sorted.findIndex((item) => item.id === overId)
    const updates = reorderUpdates(sorted, fromIndex, toIndex)
    if (updates.length === 0) return
    const previousOrder = new Map(sorted.map((item) => [item.id, item.order_index ?? null]))
    const updateMap = new Map(updates.map((update) => [update.id, update.order_index]))
    setItems((prev) => prev.map((item) => (updateMap.has(item.id) ? { ...item, order_index: updateMap.get(item.id)! } : item)))
    const supabase = createClient()
    Promise.all(updates.map(({ id, order_index }) => supabase.from('packing_items').update({ order_index }).eq('id', id)))
      .then((results) => {
        if (results.every((result) => !result.error)) return
        setItems((prev) => prev.map((item) => (previousOrder.has(item.id) ? { ...item, order_index: previousOrder.get(item.id) } : item)))
        showToast(
          results.some((result) => isMissingSchemaError(result.error))
            ? 'Run migration 20260717040000 to reorder items.'
            : "Couldn't save the new order.",
          'error',
        )
      })
  }, [canEdit, items, setItems])

  const importTemplate = useCallback(async (rows: TemplateRow[]) => {
    if (!canEdit || rows.length === 0) return false
    const supabase = createClient()
    const baseIndex = new Map<PackingCategoryKey, number>()
    const insertRows = rows.map((row) => {
      const categoryItems = items.filter((item) => item.category === row.category)
      const offset = baseIndex.get(row.category) ?? 0
      baseIndex.set(row.category, offset + 1)
      return {
        trip_id: tripId,
        category: row.category,
        label: row.label,
        created_by: userId,
        order_index: nextOrderIndex(categoryItems) + offset * 1024,
      }
    })
    let { data, error } = await supabase.from('packing_items').insert(insertRows).select()
    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await supabase
        .from('packing_items')
        .insert(rows.map((row) => ({ trip_id: tripId, category: row.category, label: row.label, created_by: userId })))
        .select())
    }
    if (error || !data) {
      showToast("Couldn't import the starter items.", 'error')
      return false
    }
    setItems((previous) => {
      const byId = new Map(previous.map((item) => [item.id, item]))
      for (const item of data as PackingItemRow[]) byId.set(item.id, item)
      return [...byId.values()]
    })
    showToast(`Added ${data.length} item${data.length === 1 ? '' : 's'} to your list.`, 'success')
    return true
  }, [canEdit, items, setItems, tripId, userId])

  // ── Task mutations ─────────────────────────────────────────────────────────

  const toggleTask = useCallback((task: TripTaskRow) => {
    if (!canEdit) return
    const nextDone = !task.done
    hapticTap()
    setTasks((prev) => prev.map((row) => (row.id === task.id
      ? { ...row, done: nextDone, completed_by: nextDone ? userId : null, completed_at: nextDone ? new Date().toISOString() : null }
      : row)))
    createClient()
      .from('trip_tasks')
      .update({ done: nextDone, completed_by: nextDone ? userId : null, completed_at: nextDone ? new Date().toISOString() : null })
      .eq('id', task.id)
      .then(({ error }) => {
        if (error) {
          setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)))
          showToast("Couldn't update the task.", 'error')
        }
      })
  }, [canEdit, setTasks, userId])

  const quickAddTask = useCallback(async (category: Exclude<TripTaskCategory, 'packing'>, title: string) => {
    if (!canEdit) return
    const { data, error } = await createClient()
      .from('trip_tasks')
      .insert({ trip_id: tripId, category, title, created_by: userId })
      .select()
      .single()
    if (!error && data) {
      const row = data as TripTaskRow
      setTasks((prev) => (prev.some((task) => task.id === row.id) ? prev.map((task) => (task.id === row.id ? row : task)) : [...prev, row]))
    } else {
      showToast(
        isMissingSchemaError(error) ? 'Run migration 20260717040000 to use prep tasks.' : "Couldn't add the task.",
        'error',
      )
    }
  }, [canEdit, setTasks, tripId, userId])

  const saveTaskPatch = useCallback(async (id: string, patch: Partial<TripTaskRow>) => {
    if (!canEdit) return false
    const { data, error } = await createClient()
      .from('trip_tasks')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error || !data) {
      showToast("Couldn't save the task.", 'error')
      return false
    }
    const row = data as TripTaskRow
    setTasks((prev) => prev.map((task) => (task.id === id ? row : task)))
    return true
  }, [canEdit, setTasks])

  const deleteTask = useCallback((task: TripTaskRow) => {
    if (!canEdit) return
    setTasks((prev) => prev.filter((row) => row.id !== task.id))
    createClient().from('trip_tasks').delete().eq('id', task.id).then(({ error }) => {
      if (error) {
        setTasks((prev) => (prev.some((row) => row.id === task.id) ? prev : [...prev, task]))
        showToast("Couldn't remove the task.", 'error')
      }
    })
  }, [canEdit, setTasks])

  // ── Derived ────────────────────────────────────────────────────────────────

  const readiness = useMemo(() => computeReadiness(buildReadinessSections(items, tasks)), [items, tasks])
  const bringSummary = useMemo(() => whoBringsWhat(items, members, userId), [items, members, userId])
  const hasAssignments = bringSummary.some((entry) => entry.userId !== null)

  // Resolve the open detail row from live state so realtime edits surface the
  // sheet's conflict indicator (and a remote delete closes it).
  const detailTarget: DetailTarget | null = useMemo(() => {
    if (!detail) return null
    if (detail.kind === 'packing') {
      const row = items.find((item) => item.id === detail.id)
      return row ? { kind: 'packing', row } : null
    }
    const row = tasks.find((task) => task.id === detail.id)
    return row ? { kind: 'task', row } : null
  }, [detail, items, tasks])

  useEffect(() => {
    if (detail && !detailTarget) {
      setDetail(null)
      showToast('This item was removed by a teammate.', 'info')
    }
  }, [detail, detailTarget])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: i === 0 ? 120 : 66, borderRadius: 20, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, animation: 'pulseglow 1.6s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ paddingTop: 14 }}>
        <RetryCard
          title="Couldn't load your packing list"
          hint="Check your connection — or run migration 010 if you haven't yet."
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 14 }}>
      {/* Readiness overview — glass tier, computed from real data only. */}
      <div className="glass-standard" style={{ borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em' }}>Trip readiness</div>
            <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 2, fontWeight: 500 }}>
              {readiness.totalItems === 0
                ? 'Nothing tracked yet — add packing items or prep tasks.'
                : `${readiness.doneItems}/${readiness.totalItems} done across ${readiness.activeSections.length} section${readiness.activeSections.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT_LIGHT }}>{readiness.percent}%</div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${readiness.percent}%`, borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT_DARK}, ${ACCENT_LIGHT})`, transition: 'width .3s ease' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {(['packing', 'reservation', 'document', 'payment', 'vehicle', 'custom'] as const).map((key) => {
            const section = readiness.activeSections.find((candidate) => candidate.key === key)
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: section ? 'rgba(245,166,35,.1)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${section ? 'rgba(245,166,35,.3)' : 'rgba(255,255,255,.09)'}`,
                  color: section ? tokens.textSecondary : tokens.textMuted,
                }}
              >
                {READINESS_SECTION_LABEL[key]}
                <span style={{ fontWeight: 800, color: section ? ACCENT_LIGHT : tokens.textMuted }}>
                  {section ? `${section.done}/${section.total}` : '—'}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {/* Empty-list starter CTA — import is always user-initiated. */}
      {items.length === 0 && (
        <div style={{ background: GLASS_FILL, border: '1px solid rgba(245,166,35,.3)', borderRadius: 20, padding: '20px 18px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{VIBE_PACKING_EMOJI[vibe ?? 'Road'] ?? '🧳'}</div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{canEdit ? 'Start your packing list' : 'No packing items yet'}</div>
          <div style={{ fontSize: 12.5, color: tokens.textMuted, marginTop: 4, lineHeight: 1.5 }}>
            {canEdit ? `Preview a starter list tailored to your ${vibe ?? 'Road'} trip and pick what to import.` : 'An editor can add a shared packing list for this trip.'}
          </div>
          {canEdit && (
            <button
              onClick={() => setTemplateOpen(true)}
              style={{ marginTop: 14, minHeight: 44, padding: '11px 22px', borderRadius: 12, background: ACCENT_GRADIENT, border: 'none', color: '#1a0800', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 20px rgba(245,140,0,.25)' }}
            >
              Browse {vibe ?? 'Road'} starter list
            </button>
          )}
        </div>
      )}

      {/* Packing checklist */}
      <section aria-label="Packing checklist" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>Packing</div>
          {canEdit && items.length > 0 && (
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)', color: ACCENT_LIGHT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Templates
            </button>
          )}
        </div>
        <PackingSection
          items={items}
          members={members}
          currentUserId={userId}
          canEdit={canEdit}
          filter={filter}
          onFilterChange={setFilter}
          onToggle={togglePacking}
          onQuickAdd={quickAddPacking}
          onOpenDetail={(item) => setDetail({ kind: 'packing', id: item.id })}
          onReorder={reorderPacking}
        />
      </section>

      {/* Who brings what */}
      {items.length > 0 && (hasAssignments || members.length > 1) && (
        <section aria-label="Who brings what" style={{ background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}`, borderRadius: 20, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 10 }}>Who brings what</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bringSummary.map((entry) => (
              <div key={entry.userId ?? 'unassigned'} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: entry.userId ? (entry.departed ? tokens.textMuted : tokens.textPrimary) : tokens.textMuted, fontStyle: entry.departed ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary, flex: 'none' }}>
                  {entry.packed}/{entry.total} packed
                </span>
                <span aria-hidden="true" style={{ width: 56, height: 5, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden', flex: 'none' }}>
                  <span style={{ display: 'block', height: '100%', width: `${entry.total ? Math.round((entry.packed / entry.total) * 100) : 0}%`, background: `linear-gradient(90deg, ${ACCENT_DARK}, ${ACCENT_LIGHT})`, borderRadius: 999 }} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Prep tasks */}
      <section aria-label="Prep tasks" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>Before you go</div>
        {tasksUnavailable ? (
          <div style={{ background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}`, borderRadius: 20, padding: 16, fontSize: 12.5, color: tokens.textMuted, fontWeight: 500, lineHeight: 1.5 }}>
            Prep tasks need migration <code style={{ fontSize: 11.5 }}>20260717040000_trip_readiness</code>. Run it in the Supabase SQL Editor to unlock reservations, documents, payments, and vehicle checklists.
          </div>
        ) : (
          <TaskSection
            tasks={tasks}
            members={members}
            currentUserId={userId}
            canEdit={canEdit}
            onToggle={toggleTask}
            onQuickAdd={quickAddTask}
            onOpenDetail={(task) => setDetail({ kind: 'task', id: task.id })}
          />
        )}
      </section>

      <div style={{ height: 20 }} />

      <PrepDetailSheet
        target={detailTarget}
        members={members}
        currentUserId={userId}
        canEdit={canEdit}
        onClose={() => setDetail(null)}
        onSavePacking={savePackingPatch}
        onSaveTask={saveTaskPatch}
        onDeletePacking={deletePacking}
        onDeleteTask={deleteTask}
      />
      <TemplatePickerSheet
        open={templateOpen}
        vibe={vibe}
        existingItems={items}
        onClose={() => setTemplateOpen(false)}
        onImport={importTemplate}
      />
    </div>
  )
}
