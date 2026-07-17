'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from './client'

export type TripRealtimeTable = 'stops' | 'packing_items' | 'expenses' | 'journal_entries' | 'itinerary_items' | 'reservations' | 'expense_splits' | 'settlements'
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
}

const TripRealtimeContext = createContext<TripRealtimeContextValue | null>(null)
const TABLES: TripRealtimeTable[] = ['stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items', 'reservations', 'expense_splits', 'settlements']

export function TripRealtimeProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const [status, setStatus] = useState<TripRealtimeStatus>('connecting')
  const listenersRef = useRef(new Map<TripRealtimeTable, Set<Listener>>())

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
    let channel = supabase.channel(`trip-domains:${tripId}`)

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

    const markReconnecting = () => {
      if (!disposed) setStatus(connectedOnce ? 'reconnecting' : 'connecting')
    }
    const markDisconnected = () => {
      if (!disposed) setStatus('disconnected')
    }

    window.addEventListener('offline', markDisconnected)
    window.addEventListener('online', markReconnecting)

    channel.subscribe((nextStatus) => {
      if (disposed) return
      if (nextStatus === 'SUBSCRIBED') {
        connectedOnce = true
        setStatus('connected')
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
    })

    return () => {
      disposed = true
      window.removeEventListener('offline', markDisconnected)
      window.removeEventListener('online', markReconnecting)
      void supabase.removeChannel(channel)
    }
  }, [tripId])

  const value = useMemo(() => ({ status, listen }), [listen, status])
  return <TripRealtimeContext.Provider value={value}>{children}</TripRealtimeContext.Provider>
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
