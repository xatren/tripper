'use client'

import type { ItineraryItem, Stop, Trip, TripMember } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { OFFLINE_STATIC_CACHE_NAME } from './cache-contract'
import { getSnapshot, saveSnapshot } from './db'
import type { TripOfflineSnapshot } from './types'

interface SnapshotSeed {
  userId: string
  trip: Trip
  members: TripMember[]
  stops: Stop[]
  itinerary: ItineraryItem[]
  routeGeometry: { lat: number; lng: number }[]
}

function row(value: object): Record<string, unknown> {
  return { ...value }
}

function optionalRows(result: { data: unknown[] | null; error: { code?: string } | null }): Record<string, unknown>[] {
  if (result.error?.code === '42P01' || result.error?.code === '42703' || result.error?.code === 'PGRST205') return []
  if (result.error || !result.data) throw new Error('Some trip data could not be downloaded. Check your connection and permissions.')
  return result.data as Record<string, unknown>[]
}

export async function downloadTripSnapshot(seed: SnapshotSeed): Promise<TripOfflineSnapshot> {
  if (!navigator.onLine) throw new Error('Connect to the internet before downloading this trip.')
  const supabase = createClient()
  const [reservationResult, packingResult, taskResult, expenseResult, journalResult, eventResult] = await Promise.all([
    supabase.from('reservations').select('id,trip_id,itinerary_item_id,reservation_type,provider,title,start_at,end_at,timezone,address,lat,lng,amount,currency,payment_status,status,notes,created_by,created_at,updated_at').eq('trip_id', seed.trip.id),
    supabase.from('packing_items').select('*').eq('trip_id', seed.trip.id),
    supabase.from('trip_tasks').select('*').eq('trip_id', seed.trip.id),
    supabase.from('expenses').select('id,trip_id,stop_id,category,amount,description,paid_by,created_at,split_type,expense_date,itinerary_item_id,expense_splits(id,member_id,share_value,share_amount_minor,created_at)').eq('trip_id', seed.trip.id),
    supabase.from('journal_entries').select('id,trip_id,entry_date,note,created_by,created_at,occurred_at,itinerary_item_id,visibility,is_hidden,location_lat,location_lng,journal_photos(id,entry_id,caption,created_at)').eq('trip_id', seed.trip.id),
    supabase.from('trip_events').select('id,trip_id,itinerary_item_id,event_type,occurred_at,recorded_at,created_by,visibility,metadata,is_hidden,idempotency_key,updated_at').eq('trip_id', seed.trip.id),
  ])

  const now = new Date().toISOString()
  const snapshot = await saveSnapshot({
    user_id: seed.userId,
    trip_id: seed.trip.id,
    downloaded_at: now,
    updated_at: now,
    trip: row(seed.trip),
    members: seed.members.map((member) => ({
      trip_id: member.trip_id,
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      display_name: member.profile?.display_name ?? (member.user_id === seed.userId ? 'You' : 'Trip member'),
    })),
    stops: seed.stops.map(row),
    itinerary: seed.itinerary.map(row),
    reservations: optionalRows(reservationResult),
    packing: optionalRows(packingResult),
    tasks: optionalRows(taskResult),
    expenses: optionalRows(expenseResult),
    journal: optionalRows(journalResult),
    events: optionalRows(eventResult),
    route_geometry: seed.routeGeometry,
    // Media bytes are deliberately opt-in and are not downloaded here.
    media_manifest: [],
  })
  const verified = await getSnapshot(seed.userId, seed.trip.id)
  if (!verified) throw new Error('The downloaded data did not pass integrity validation. Please retry.')
  // The shell is public and contains no user data; authenticated SSR/API
  // responses remain excluded from Cache Storage.
  if ('caches' in window) await caches.open(OFFLINE_STATIC_CACHE_NAME).then((cache) => cache.add('/offline.html')).catch(() => undefined)
  return snapshot
}

export async function storageEstimate(): Promise<{ usage: number | null; quota: number | null }> {
  if (!navigator.storage?.estimate) return { usage: null, quota: null }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? null, quota: estimate.quota ?? null }
}
