'use client'

import { createClient } from '@/lib/supabase/client'
import { acknowledgeMediaUpload, acknowledgeMutation, listMediaQueue, listQueue, setMediaQueueState, setQueueState } from './db'
import { OFFLINE_MAX_RETRIES, type OfflineMediaQueueItem, type OfflineQueueItem } from './types'

type SyncResult = { ok: true; row?: Record<string, unknown> } | { ok: false; kind: 'auth' | 'conflict' | 'transient' | 'permanent'; message: string }

let activeFlush: Promise<void> | null = null

function errorResult(error: { code?: string; message?: string; status?: number } | null): SyncResult {
  if (!error) return { ok: true }
  const status = error.status ?? Number(error.code)
  if (status === 401 || status === 403 || error.code === '42501') return { ok: false, kind: 'auth', message: 'Sign in again or ask a trip owner to restore access.' }
  if (status === 409 || error.code === 'PGRST116') return { ok: false, kind: 'conflict', message: 'This item changed elsewhere. Review before applying your device copy.' }
  if (status >= 500 || error.code === 'PGRST000' || /network|fetch/i.test(error.message ?? '')) return { ok: false, kind: 'transient', message: 'Temporary network or server error.' }
  return { ok: false, kind: 'permanent', message: error.message ?? 'This change could not be synced.' }
}

async function applyMutation(item: OfflineQueueItem): Promise<SyncResult> {
  const supabase = createClient()
  const payload = item.payload
  if (item.entity === 'packing_item') {
    if (item.action === 'create') {
      const { data, error } = await supabase.from('packing_items').insert(payload).select().single()
      if (error?.code === '23505') return { ok: true }
      return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
    }
    let query = supabase.from('packing_items').update(payload).eq('id', item.entity_id).eq('trip_id', item.trip_id)
    if (item.base_version) query = query.eq('updated_at', item.base_version)
    const { data, error } = await query.select()
    if (!error && item.base_version && data?.length === 0) return { ok: false, kind: 'conflict', message: 'Packing item changed elsewhere.' }
    return error ? errorResult(error) : { ok: true, row: data?.[0] as Record<string, unknown> | undefined }
  }
  if (item.entity === 'trip_task') {
    if (item.action === 'create') {
      const { data, error } = await supabase.from('trip_tasks').insert(payload).select().single()
      if (error?.code === '23505') return { ok: true }
      return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
    }
    let query = supabase.from('trip_tasks').update(payload).eq('id', item.entity_id).eq('trip_id', item.trip_id)
    if (item.base_version) query = query.eq('updated_at', item.base_version)
    const { data, error } = await query.select()
    if (!error && item.base_version && data?.length === 0) return { ok: false, kind: 'conflict', message: 'Task changed elsewhere.' }
    return error ? errorResult(error) : { ok: true, row: data?.[0] as Record<string, unknown> | undefined }
  }
  if (item.entity === 'journal_entry') {
    if (item.action === 'create') {
      const { data, error } = await supabase.from('journal_entries').insert(payload).select().single()
      if (error?.code === '23505') return { ok: true }
      return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
    }
    const { data, error } = await supabase.from('journal_entries').update(payload).eq('id', item.entity_id).eq('trip_id', item.trip_id).select().single()
    return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
  }
  if (item.entity === 'trip_event') {
    if (item.action === 'create') {
      const { data, error } = await supabase.from('trip_events').insert(payload).select().single()
      if (error?.code === '23505') return { ok: true }
      return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
    }
    const { data, error } = await supabase.from('trip_events').update(payload).eq('id', item.entity_id).eq('trip_id', item.trip_id).select().single()
    return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
  }
  if (item.entity === 'expense') {
    const { data, error } = await supabase.from('expenses').insert(payload).select().single()
    if (error?.code === '23505') return { ok: true }
    return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
  }
  if (item.action === 'create') {
    const { data, error } = await supabase.from('itinerary_items').insert(payload).select().single()
    if (error?.code === '23505') return { ok: true }
    return error ? errorResult(error) : { ok: true, row: data as Record<string, unknown> }
  }
  if (item.action === 'update_status') {
    const { data, error } = await supabase.rpc('transition_itinerary_status', {
      p_trip_id: item.trip_id,
      p_item_id: item.entity_id,
      p_target_status: payload.status,
      p_occurred_at: item.created_at,
      p_idempotency_key: item.idempotency_key,
      p_expected_updated_at: item.base_version,
    })
    if (!error) return { ok: true, row: data as Record<string, unknown> }
    if (error.code === '40001') return { ok: false, kind: 'conflict', message: 'This stop changed on another device. Refresh before choosing the next state.' }
    return errorResult(error)
  }
  let query = supabase.from('itinerary_items').update(payload).eq('id', item.entity_id).eq('trip_id', item.trip_id)
  if (item.base_version) query = query.eq('updated_at', item.base_version)
  const { data, error } = await query.select()
  if (!error && item.base_version && data?.length === 0) {
    return { ok: false, kind: 'conflict', message: 'Itinerary notes changed elsewhere. Review both versions.' }
  }
  return error ? errorResult(error) : { ok: true, row: data?.[0] as Record<string, unknown> | undefined }
}

async function applyMediaUpload(item: OfflineMediaQueueItem): Promise<SyncResult> {
  const supabase = createClient()
  const { error: uploadError } = await supabase.storage.from('trip-photos').upload(item.storage_path, item.blob, {
    contentType: item.mime_type,
    upsert: false,
  })
  if (uploadError && uploadError.statusCode !== '409') return errorResult(uploadError)
  const { error: linkError } = await supabase.from('journal_photos').insert({
    entry_id: item.entry_id,
    storage_path: item.storage_path,
    uploaded_by: item.user_id,
  })
  if (linkError?.code === '23505') return { ok: true }
  if (linkError) {
    await supabase.storage.from('trip-photos').remove([item.storage_path])
    return errorResult(linkError)
  }
  return { ok: true }
}

function dependencyOrder(items: OfflineQueueItem[]): OfflineQueueItem[] {
  const pendingIds = new Set(items.map((item) => item.id))
  return [...items].sort((a, b) => {
    if (a.depends_on && pendingIds.has(a.depends_on) && !b.depends_on) return 1
    if (b.depends_on && pendingIds.has(b.depends_on) && !a.depends_on) return -1
    return a.created_at.localeCompare(b.created_at)
  })
}

export async function flushOfflineQueue(userId: string): Promise<void> {
  if (activeFlush) return activeFlush
  activeFlush = (async () => {
    if (!navigator.onLine) return
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user || user.id !== userId) return
    const items = dependencyOrder((await listQueue(userId)).filter((item) => {
      if (item.status === 'blocked' || item.status === 'conflict' || item.status === 'failed') return false
      return !item.next_retry_at || item.next_retry_at <= new Date().toISOString()
    }))
    const completed = new Set<string>()
    for (const item of items) {
      if (item.depends_on && !completed.has(item.depends_on) && items.some((candidate) => candidate.id === item.depends_on)) continue
      const result = await applyMutation(item)
      if (result.ok) {
        await acknowledgeMutation(item, result.row)
        completed.add(item.id)
        continue
      }
      if (result.kind === 'auth') await setQueueState(item.id, 'blocked', result.message)
      else if (result.kind === 'conflict') await setQueueState(item.id, 'conflict', result.message)
      else if (result.kind === 'transient') {
        const retries = item.retry_count + 1
        await setQueueState(item.id, retries >= OFFLINE_MAX_RETRIES ? 'failed' : 'retrying', result.message, retries)
      } else await setQueueState(item.id, 'failed', result.message, OFFLINE_MAX_RETRIES)
    }
    const mediaItems = (await listMediaQueue(userId)).filter((item) => {
      if (item.status === 'blocked' || item.status === 'conflict' || item.status === 'failed') return false
      return !item.next_retry_at || item.next_retry_at <= new Date().toISOString()
    })
    for (const item of mediaItems) {
      const result = await applyMediaUpload(item)
      if (result.ok) {
        await acknowledgeMediaUpload(item.id)
        continue
      }
      if (result.kind === 'auth') await setMediaQueueState(item.id, 'blocked', result.message)
      else if (result.kind === 'conflict') await setMediaQueueState(item.id, 'conflict', result.message)
      else if (result.kind === 'transient') {
        const retries = item.retry_count + 1
        await setMediaQueueState(item.id, retries >= OFFLINE_MAX_RETRIES ? 'failed' : 'retrying', result.message, retries)
      } else await setMediaQueueState(item.id, 'failed', result.message, OFFLINE_MAX_RETRIES)
    }
  })().finally(() => { activeFlush = null })
  return activeFlush
}
