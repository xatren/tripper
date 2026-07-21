'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Profile, TripMember } from '@/types'
import { isPresenceFresh } from '@/lib/presence'
import { createClient } from './client'

export type TripRealtimeTable = 'stops' | 'packing_items' | 'expenses' | 'journal_entries' | 'itinerary_items' | 'reservations' | 'expense_splits' | 'settlements' | 'trip_tasks' | 'trip_comments' | 'trip_activity' | 'trip_members' | 'trip_events'
export type TripRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface TripRealtimeChange<Row extends Record<string, unknown> = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Partial<Row>
  old: Partial<Row>
}

interface Listener {
  onChange: (change: TripRealtimeChange) => void
  onResync: () => void
}

interface TripRealtimeContextValue {
  status: TripRealtimeStatus
  listen: (table: TripRealtimeTable, listener: Listener) => () => void
  presence: TripPresence[]
  setPresenceSection: (section: string) => void
  setEditingEntity: (entityId: string | null) => void
}

export interface TripPresence {
  connectionId: string
  userId: string
  currentSection: string
  editingEntityId: string | null
  lastSeenAt: string
  profile?: Profile
}

interface PresencePayload {
  connection_id?: string
  user_id?: string
  current_section?: string
  editing_entity_id?: string | null
  last_seen_at?: string
}

const TripRealtimeContext = createContext<TripRealtimeContextValue | null>(null)
const TABLES: TripRealtimeTable[] = ['stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items', 'reservations', 'expense_splits', 'settlements', 'trip_tasks', 'trip_comments', 'trip_activity', 'trip_members', 'trip_events']
const PRESENCE_HEARTBEAT_MS = 20_000

export function TripRealtimeProvider({ tripId, currentUserId, members, children }: { tripId: string; currentUserId: string; members: TripMember[]; children: ReactNode }) {
  const [status, setStatus] = useState<TripRealtimeStatus>('connecting')
  const [presence, setPresence] = useState<TripPresence[]>([])
  const listenersRef = useRef(new Map<TripRealtimeTable, Set<Listener>>())
  const sectionRef = useRef('overview')
  const editingEntityRef = useRef<string | null>(null)
  const trackRef = useRef<(() => void) | null>(null)
  const profilesRef = useRef(new Map(members.map((member) => [member.user_id, member.profile])))
  useEffect(() => {
    profilesRef.current = new Map(members.map((member) => [member.user_id, member.profile]))
  }, [members])

  const setPresenceSection = useCallback((section: string) => {
    sectionRef.current = section
    trackRef.current?.()
  }, [])
  const setEditingEntity = useCallback((entityId: string | null) => {
    editingEntityRef.current = entityId
    trackRef.current?.()
  }, [])

  const listen = useCallback((table: TripRealtimeTable, listener: Listener) => {
    const listeners = listenersRef.current.get(table) ?? new Set<Listener>()
    listeners.add(listener)
    listenersRef.current.set(table, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) listenersRef.current.delete(table)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let connectedOnce = false
    const supabase = createClient()
    const connectionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    let channel = supabase.channel(`trip:${tripId}`, {
      config: { private: true, presence: { key: connectionId } },
    })

    for (const table of TABLES) {
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel = channel.on(
          'postgres_changes',
          { event, schema: 'public', table, filter: `trip_id=eq.${tripId}` },
          (payload) => {
            if (disposed) return
            const change = payload as TripRealtimeChange
            for (const listener of listenersRef.current.get(table) ?? []) listener.onChange(change)
          },
        )
      }
    }

    // Supabase cannot filter Postgres DELETE changes. Database triggers write
    // a compact, trip-scoped signal instead, so clients never receive deletes
    // belonging to another trip.
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel = channel.on(
        'postgres_changes',
        { event, schema: 'public', table: 'trip_realtime_deletes', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (disposed) return
          const signal = payload.new as { table_name?: TripRealtimeTable; row_id?: string }
          if (!signal.table_name || !signal.row_id || !TABLES.includes(signal.table_name)) return
          const change: TripRealtimeChange = { eventType: 'DELETE', new: {}, old: { id: signal.row_id, trip_id: tripId } }
          for (const listener of listenersRef.current.get(signal.table_name) ?? []) listener.onChange(change)
        },
      )
    }

    const syncPresence = () => {
      if (disposed) return
      const now = Date.now()
      const next: TripPresence[] = []
      const state = channel.presenceState<PresencePayload>()
      for (const entries of Object.values(state)) {
        for (const entry of entries) {
          const userId = entry.user_id
          const lastSeenAt = entry.last_seen_at
          if (!userId || !lastSeenAt || !isPresenceFresh(lastSeenAt, now)) continue
          // Profile fields are never trusted from Presence. They are joined
          // from the RLS-protected trip member query instead.
          next.push({
            connectionId: entry.connection_id ?? userId,
            userId,
            currentSection: entry.current_section?.slice(0, 32) || 'overview',
            editingEntityId: entry.editing_entity_id ?? null,
            lastSeenAt,
            profile: profilesRef.current.get(userId),
          })
        }
      }
      setPresence(next)
    }
    channel = channel.on('presence', { event: 'sync' }, syncPresence)

    const track = () => {
      if (disposed) return
      void channel.track({
        connection_id: connectionId,
        user_id: currentUserId,
        current_section: sectionRef.current,
        editing_entity_id: editingEntityRef.current,
        last_seen_at: new Date().toISOString(),
      })
    }
    trackRef.current = track

    const markReconnecting = () => {
      if (!disposed) setStatus(connectedOnce ? 'reconnecting' : 'connecting')
    }
    const markDisconnected = () => {
      if (!disposed) setStatus('disconnected')
    }

    window.addEventListener('offline', markDisconnected)
    window.addEventListener('online', markReconnecting)

    const handleChannelStatus = (nextStatus: string) => {
      if (disposed) return
      if (nextStatus === 'SUBSCRIBED') {
        connectedOnce = true
        setStatus('connected')
        track()
        // Postgres Changes is not a durable event log. A canonical read after
        // every (re)join closes any gap accumulated while the socket was down.
        for (const listeners of listenersRef.current.values()) {
          for (const listener of listeners) listener.onResync()
        }
      } else if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
        setStatus('reconnecting')
      } else if (nextStatus === 'CLOSED') {
        setStatus(navigator.onLine ? 'reconnecting' : 'disconnected')
      }
    }

    // Private Presence authorization reads auth.uid() through realtime.messages
    // RLS. The payload itself is never used to grant access.
    void supabase.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(handleChannelStatus)
    }).catch(() => {
      if (!disposed) setStatus('disconnected')
    })
    const heartbeat = window.setInterval(track, PRESENCE_HEARTBEAT_MS)
    const staleSweep = window.setInterval(syncPresence, 10_000)

    return () => {
      disposed = true
      trackRef.current = null
      window.clearInterval(heartbeat)
      window.clearInterval(staleSweep)
      window.removeEventListener('offline', markDisconnected)
      window.removeEventListener('online', markReconnecting)
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, tripId])

  const value = useMemo(() => ({ status, listen, presence, setPresenceSection, setEditingEntity }), [listen, presence, setEditingEntity, setPresenceSection, status])
  return <TripRealtimeContext.Provider value={value}>{children}</TripRealtimeContext.Provider>
}

export function useTripPresence() {
  return useContext(TripRealtimeContext)?.presence ?? []
}

export function useTripPresenceSection(section: string) {
  const realtime = useContext(TripRealtimeContext)
  useEffect(() => {
    realtime?.setPresenceSection(section)
  }, [realtime, section])
}

export function useTripEditingEntity(entityId: string | null) {
  const realtime = useContext(TripRealtimeContext)
  useEffect(() => {
    realtime?.setEditingEntity(entityId)
    return () => realtime?.setEditingEntity(null)
  }, [entityId, realtime])
}

export function useTripRealtimeTable<Row extends Record<string, unknown>>(
  table: TripRealtimeTable,
  onChange: (change: TripRealtimeChange<Row>) => void,
  onResync: () => void,
) {
  const realtime = useContext(TripRealtimeContext)

  useEffect(() => {
    if (!realtime) return
    return realtime.listen(table, {
      onChange: onChange as (change: TripRealtimeChange) => void,
      onResync,
    })
  }, [onChange, onResync, realtime, table])
}

export function TripRealtimeStatusBadge() {
  const realtime = useContext(TripRealtimeContext)
  if (!realtime || realtime.status === 'connected') return null

  const disconnected = realtime.status === 'disconnected'
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'max(10px, env(safe-area-inset-top))',
        left: '50%',
        zIndex: 160,
        transform: 'translateX(-50%)',
        padding: '6px 10px',
        borderRadius: 999,
        background: 'rgba(11,11,30,.82)',
        border: '1px solid rgba(255,255,255,.14)',
        boxShadow: '0 5px 18px rgba(0,0,0,.28)',
        backdropFilter: 'blur(14px)',
        color: 'rgba(245,245,255,.78)',
        fontSize: 11,
        fontWeight: 700,
        pointerEvents: 'none',
      }}
    >
      {disconnected ? 'Live updates paused' : 'Syncing trip changes…'}
    </div>
  )
}
