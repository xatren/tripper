'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DayStrip, InlineError, tokens, type DayStripDay } from '@/components/mobile'
import { downloadTripIcs } from '@/lib/ics'
import type { ItineraryItem, ItineraryItemStatus, ItineraryItemType, Stop, Trip, TripCurrency } from '@/types'
import {
  buildTimeline, projectStopSchedule,
  type TimelineDay, type TimelineEntry,
} from '../itinerary-projection'
import { formatDayChip, tripTitle } from '../trip-domain-utils'
import { localDateISO } from '../trip-lifecycle'
import { ItineraryDaySection } from './ItineraryDaySection'
import { UnscheduledDrawer } from './UnscheduledDrawer'
import { ItineraryItemSheet, type DayOption, type ItineraryItemDraft } from './ItineraryItemSheet'
import { BottomSheet } from '../components/BottomSheet'
import { toDatetimeLocalValue } from './itinerary-ui'

export interface ItineraryCreateRequest {
  type: ItineraryItemType
  /** Changes on every request so repeated picks of the same type re-open the sheet. */
  nonce: number
}

export interface ItineraryTimelineProps {
  trip: Trip
  stops: Stop[]
  items: ItineraryItem[]
  setItems: Dispatch<SetStateAction<ItineraryItem[]>>
  /** Pause/resume the realtime item merge during drags/optimistic bursts. */
  onItemSyncPaused: (paused: boolean) => void
  canEdit: boolean
  currentUserId: string
  /** False until the itinerary_items migration is applied to this database. */
  itineraryEnabled: boolean
  /** Set by the trip-level "+ Add" sheet to open the create form pre-typed. */
  createRequest: ItineraryCreateRequest | null
  selectedDayId?: string | null
  onSelectedDayIdChange?: (id: string | null) => void
  selectedItemId?: string | null
  onSelectItem?: (id: string) => void
}

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

/** Same wall-clock time on a different calendar day, in the device zone. */
function instantOnDate(dateISO: string, timeHHmm: string): string {
  return new Date(`${dateISO}T${timeHHmm.length === 5 ? timeHHmm : '00:00'}:00`).toISOString()
}

function emptyDraft(type: ItineraryItemType, localDate: string, currency: TripCurrency): ItineraryItemDraft {
  return {
    id: null, item_type: type, title: '', notes: '', localDate, allDay: false,
    startTime: '', endTime: '', address: '', estimatedCost: '', currency,
    status: 'planned', isLocked: false, stopId: null,
  }
}

function draftFromItem(item: ItineraryItem): ItineraryItemDraft {
  const startLocal = toDatetimeLocalValue(item.start_at)
  const endLocal = toDatetimeLocalValue(item.end_at)
  return {
    id: item.id,
    item_type: item.item_type,
    title: item.title,
    notes: item.notes ?? '',
    localDate: item.local_date ?? (startLocal ? startLocal.slice(0, 10) : ''),
    allDay: item.all_day,
    startTime: startLocal ? startLocal.slice(11, 16) : '',
    endTime: endLocal ? endLocal.slice(11, 16) : '',
    address: item.address ?? '',
    estimatedCost: item.estimated_cost != null ? String(item.estimated_cost) : '',
    currency: (item.currency ?? 'USD') as TripCurrency,
    status: item.status,
    isLocked: item.is_locked,
    stopId: item.stop_id,
  }
}

/**
 * The unified day-by-day itinerary: horizontal day strip (single source of
 * truth for the visible day), one day section, and the unscheduled drawer.
 * Legacy stops appear as read-only projections until items replace them.
 */
export function ItineraryTimeline({
  trip, stops, items, setItems, onItemSyncPaused,
  canEdit, currentUserId, itineraryEnabled, createRequest,
  selectedDayId: controlledSelectedDayId, onSelectedDayIdChange,
  selectedItemId, onSelectItem,
}: ItineraryTimelineProps) {
  const timeline = useMemo(
    () => buildTimeline({
      tripStartDate: trip.start_date ?? null,
      tripEndDate: trip.end_date ?? null,
      stops,
      items,
    }),
    [trip.start_date, trip.end_date, stops, items],
  )

  const dayId = (day: TimelineDay) => day.date ?? `n${day.dayNumber ?? 0}`
  const today = localDateISO()

  const [internalSelectedDayId, setInternalSelectedDayId] = useState<string | null>(null)
  const selectedDayId = controlledSelectedDayId === undefined ? internalSelectedDayId : controlledSelectedDayId
  const setSelectedDayId = useCallback((id: string | null) => {
    if (controlledSelectedDayId === undefined) setInternalSelectedDayId(id)
    onSelectedDayIdChange?.(id)
  }, [controlledSelectedDayId, onSelectedDayIdChange])
  useEffect(() => {
    if (timeline.days.length === 0) {
      setSelectedDayId(null)
      return
    }
    if (selectedDayId && timeline.days.some((day) => dayId(day) === selectedDayId)) return
    const todayCell = timeline.days.find((day) => day.date === today)
    setSelectedDayId(dayId(todayCell ?? timeline.days[0]))
  }, [selectedDayId, setSelectedDayId, timeline.days, today])

  const selectedDay = timeline.days.find((day) => dayId(day) === selectedDayId) ?? null

  // Stop names give the day strip its sublabels ("Day 3 · Florence").
  const stopNameByDate = useMemo(() => {
    const schedule = projectStopSchedule(trip.start_date ?? null, stops)
    const map = new Map<string, string>()
    schedule.forEach((slot, index) => {
      if (slot.arrival) map.set(slot.arrival, stops[index].name)
    })
    return map
  }, [trip.start_date, stops])

  const stripDays: DayStripDay[] = timeline.days.map((day) => ({
    id: dayId(day),
    label: day.dayNumber != null ? `Day ${day.dayNumber}` : (day.date ? formatDayChip(day.date).split(',')[0] : 'Day'),
    sublabel: day.date ? formatDayChip(day.date).replace(/^[^,]*,\s*/, '') : stopNameByDate.get(day.date ?? ''),
    isToday: day.date === today,
  }))

  const dayOptions: DayOption[] = timeline.days
    .filter((day) => day.date !== null)
    .map((day) => ({
      value: day.date as string,
      label: `${day.dayNumber != null ? `Day ${day.dayNumber} · ` : ''}${formatDayChip(day.date as string)}`,
    }))

  // ── Mutations (optimistic with rollback; realtime fills in collaborators) ──

  const supabase = () => createClient()
  const [sheetDraft, setSheetDraft] = useState<ItineraryItemDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TimelineEntry | null>(null)
  const [moveTarget, setMoveTarget] = useState<TimelineEntry | null>(null)

  useEffect(() => {
    if (!createRequest || !canEdit || !itineraryEnabled) return
    const defaultDate = selectedDay?.date ?? ''
    setSheetDraft(emptyDraft(createRequest.type, defaultDate, (trip.currency ?? 'USD') as TripCurrency))
    // Reopen on every new nonce even for the same type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest])

  const nextOrderIndex = useCallback((localDate: string | null) => {
    const sameDay = items.filter((item) => (item.local_date ?? null) === (localDate || null))
    return sameDay.reduce((max, item) => Math.max(max, item.order_index + 1), 0)
  }, [items])

  const saveDraft = useCallback(async (draft: ItineraryItemDraft) => {
    if (!canEdit || !itineraryEnabled) return
    setSaving(true)
    const localDate = draft.localDate || null
    const startAt = localDate && !draft.allDay && draft.startTime ? instantOnDate(localDate, draft.startTime) : null
    const endAt = startAt && draft.endTime ? instantOnDate(localDate as string, draft.endTime) : null
    const payload = {
      trip_id: trip.id,
      stop_id: draft.stopId,
      item_type: draft.item_type,
      title: draft.title.trim(),
      notes: draft.notes.trim() || null,
      start_at: startAt,
      end_at: endAt,
      all_day: draft.allDay,
      local_date: localDate,
      timezone: startAt ? deviceZone() : null,
      lat: null as number | null,
      lng: null as number | null,
      address: draft.address.trim() || null,
      estimated_cost: draft.estimatedCost ? Number(draft.estimatedCost) : null,
      currency: draft.estimatedCost ? draft.currency : null,
      status: draft.status,
      is_locked: draft.isLocked,
    }

    if (draft.id) {
      const previous = items
      setItems((current) => current.map((item) => (item.id === draft.id ? { ...item, ...payload } as ItineraryItem : item)))
      const { error } = await supabase().from('itinerary_items').update(payload).eq('id', draft.id)
      setSaving(false)
      if (error) {
        setItems(previous)
        showToast("Couldn't save the item — reverted.", 'error')
        return
      }
      setSheetDraft(null)
    } else {
      const { data, error } = await supabase()
        .from('itinerary_items')
        .insert({ ...payload, order_index: nextOrderIndex(localDate), created_by: currentUserId })
        .select()
        .single()
      setSaving(false)
      if (error || !data) {
        showToast("Couldn't add the item. Please try again.", 'error')
        return
      }
      const row = data as ItineraryItem
      setItems((current) => (current.some((item) => item.id === row.id) ? current : [...current, row]))
      setSheetDraft(null)
      if (localDate) setSelectedDayId(localDate)
    }
  }, [canEdit, itineraryEnabled, trip.id, items, setItems, nextOrderIndex, currentUserId, setSelectedDayId])

  const toggleComplete = useCallback(async (entry: TimelineEntry) => {
    if (!canEdit || entry.source !== 'item') return
    const nextStatus: ItineraryItemStatus = entry.status === 'completed' ? 'planned' : 'completed'
    const previous = items
    setItems((current) => current.map((item) => (item.id === entry.id ? { ...item, status: nextStatus } : item)))
    const { error } = await supabase().from('itinerary_items').update({ status: nextStatus }).eq('id', entry.id)
    if (error) {
      setItems(previous)
      showToast("Couldn't update the status.", 'error')
    }
  }, [canEdit, items, setItems])

  const deleteEntry = useCallback(async (entry: TimelineEntry) => {
    if (!canEdit || entry.source !== 'item') return
    const previous = items
    setItems((current) => current.filter((item) => item.id !== entry.id))
    const { error } = await supabase().from('itinerary_items').delete().eq('id', entry.id)
    if (error) {
      setItems(previous)
      showToast("Couldn't delete the item — restored.", 'error')
    }
  }, [canEdit, items, setItems])

  const moveEntry = useCallback(async (entry: TimelineEntry, targetDate: string | null, timeHHmm: string) => {
    if (!canEdit || entry.source !== 'item') return
    const source = items.find((item) => item.id === entry.id)
    if (!source) return
    const startAt = targetDate
      ? (timeHHmm
        ? instantOnDate(targetDate, timeHHmm)
        : source.start_at
          ? instantOnDate(targetDate, toDatetimeLocalValue(source.start_at).slice(11, 16))
          : null)
      : null
    // Preserve the item's duration when it had one.
    const durationMs = source.start_at && source.end_at ? Date.parse(source.end_at) - Date.parse(source.start_at) : null
    const endAt = startAt && durationMs ? new Date(Date.parse(startAt) + durationMs).toISOString() : null
    const patch = {
      local_date: targetDate,
      start_at: startAt,
      end_at: endAt,
      timezone: startAt ? deviceZone() : null,
      order_index: nextOrderIndex(targetDate),
    }
    const previous = items
    onItemSyncPaused(true)
    setItems((current) => current.map((item) => (item.id === entry.id ? { ...item, ...patch } : item)))
    const { error } = await supabase().from('itinerary_items').update(patch).eq('id', entry.id)
    onItemSyncPaused(false)
    if (error) {
      setItems(previous)
      showToast("Couldn't move the item — back to its old day.", 'error')
      return
    }
    if (targetDate) setSelectedDayId(targetDate)
  }, [canEdit, items, setItems, nextOrderIndex, onItemSyncPaused, setSelectedDayId])

  const reorderDay = useCallback((day: TimelineDay, orderedItemIds: string[]) => {
    if (!canEdit) return
    const previous = items
    const orderById = new Map(orderedItemIds.map((id, index) => [id, index]))
    onItemSyncPaused(true)
    setItems((current) => current.map((item) => (
      orderById.has(item.id) ? { ...item, order_index: orderById.get(item.id) as number } : item
    )))
    const apply = () => {
      supabase()
        .rpc('reorder_itinerary_day', { p_trip_id: trip.id, p_local_date: day.date, p_item_ids: orderedItemIds })
        .then(({ error }) => {
          onItemSyncPaused(false)
          if (error) {
            setItems(previous)
            showToast("Couldn't save the new order — reverted.", 'error', { label: 'Retry', onClick: apply })
          }
        })
    }
    apply()
  }, [canEdit, items, setItems, trip.id, onItemSyncPaused])

  // ── ICS export (parity with the previous Days tab) ──
  const exportIcs = () => {
    const schedule = projectStopSchedule(trip.start_date ?? null, stops)
    const events = stops
      .map((stop, index) => {
        const slot = schedule[index]
        return slot.arrival
          ? { name: stop.name, address: stop.address, arrival: slot.arrival, departure: addDaysSafe(slot.arrival, slot.nights) }
          : null
      })
      .filter((event): event is { name: string; address: string | null; arrival: string; departure: string } => event !== null)
    if (!events.length) {
      showToast('Set trip dates first to export the calendar.', 'info')
      return
    }
    downloadTripIcs(tripTitle(trip, stops), events)
    showToast('Calendar file downloaded.', 'success')
  }

  if (timeline.days.length === 0 && timeline.unscheduled.length === 0) {
    return (
      <div style={{ width: '100%', padding: '32px 0', textAlign: 'center', color: tokens.textMuted, fontSize: 13 }}>
        Add a destination or trip dates to start planning days.
      </div>
    )
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!itineraryEnabled && (
        <InlineError>
          Itinerary editing needs migration 20260716120000_itinerary_items — showing the route plan read-only.
        </InlineError>
      )}

      {timeline.days.length > 0 && (
        <div style={{ margin: '0 -20px' }}>
          <DayStrip days={stripDays} selectedId={selectedDayId ?? ''} onSelect={setSelectedDayId} />
        </div>
      )}

      {trip.start_date && (
        <button
          onClick={exportIcs}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, padding: '10px 16px', borderRadius: tokens.radius16, background: tokens.glassStandardFill, border: `1px solid ${tokens.glassStandardBorder}`, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tokens.accentLight} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
            <path d="M8 2.5v4M16 2.5v4M3 9.5h18M12 13v5M9.5 15.5h5" />
          </svg>
          <span style={{ color: tokens.textPrimary, fontWeight: 700, fontSize: 13 }}>Add to calendar (.ics)</span>
        </button>
      )}

      {selectedDay && (
        <section aria-label={selectedDay.date ? `Plan for ${selectedDay.date}` : `Plan for day ${selectedDay.dayNumber}`}>
          <ItineraryDaySection
            day={selectedDay}
            canEdit={canEdit && itineraryEnabled}
            onEdit={(entry) => {
              const item = items.find((candidate) => candidate.id === entry.id)
              if (item) setSheetDraft(draftFromItem(item))
            }}
            onToggleComplete={(entry) => void toggleComplete(entry)}
            onMove={setMoveTarget}
            onDelete={setDeleteTarget}
            onReorder={reorderDay}
            onAddToDay={canEdit && itineraryEnabled ? () => setSheetDraft(emptyDraft('activity', selectedDay.date ?? '', (trip.currency ?? 'USD') as TripCurrency)) : undefined}
            onSyncPaused={onItemSyncPaused}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
          />
        </section>
      )}

      <UnscheduledDrawer
        entries={timeline.unscheduled}
        canEdit={canEdit && itineraryEnabled}
        onEdit={(entry) => {
          const item = items.find((candidate) => candidate.id === entry.id)
          if (item) setSheetDraft(draftFromItem(item))
        }}
        onToggleComplete={(entry) => void toggleComplete(entry)}
        onMove={setMoveTarget}
        onDelete={setDeleteTarget}
      />

      <ItineraryItemSheet
        draft={sheetDraft}
        dayOptions={dayOptions}
        saving={saving}
        onClose={() => setSheetDraft(null)}
        onSave={(draft) => void saveDraft(draft)}
      />

      <MoveToDaySheet
        entry={moveTarget}
        dayOptions={dayOptions}
        onClose={() => setMoveTarget(null)}
        onMove={(targetDate, time) => {
          const entry = moveTarget
          setMoveTarget(null)
          if (entry) void moveEntry(entry, targetDate, time)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this item?"
        message={deleteTarget ? `"${deleteTarget.title}" will be removed from the plan. This can't be undone.` : ''}
        onConfirm={() => {
          if (deleteTarget) void deleteEntry(deleteTarget)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function addDaysSafe(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "Add to day / move to day" picker: target day plus an optional start time. */
function MoveToDaySheet({ entry, dayOptions, onClose, onMove }: {
  entry: TimelineEntry | null
  dayOptions: DayOption[]
  onClose: () => void
  onMove: (targetDate: string | null, timeHHmm: string) => void
}) {
  const [targetDate, setTargetDate] = useState('')
  const [time, setTime] = useState('')

  useEffect(() => {
    setTargetDate('')
    setTime('')
  }, [entry])

  return (
    <BottomSheet open={entry !== null} onClose={onClose} titleId="itinerary-move-sheet-title" title={entry ? `Move “${entry.title}”` : 'Move item'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 8px' }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Day</span>
          <select
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
          >
            <option value="">Unscheduled</option>
            {dayOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {targetDate && (
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Time (optional)</span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => onMove(targetDate || null, time)}
          style={{ minHeight: 44, borderRadius: 12, border: 'none', cursor: 'pointer', background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, fontSize: 13.5, fontFamily: 'inherit' }}
        >
          Move item
        </button>
      </div>
    </BottomSheet>
  )
}
