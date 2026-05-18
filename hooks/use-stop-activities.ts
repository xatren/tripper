'use client'

import { useReducer, useCallback, useRef } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { createClient } from '@/lib/supabase/client'
import type { Activity } from '@/types'

/* ── Extended type with computed distance ──────────────────── */

export interface ActivityWithMeta extends Activity {
  /** Haversine km to the next activity in the list — undefined for the last item */
  distanceToNextKm?: number
}

/* ── Reducer ───────────────────────────────────────────────── */

interface State {
  items: ActivityWithMeta[]
  isLoaded: boolean
  isLoading: boolean
}

type Action =
  | { type: 'LOADING' }
  | { type: 'LOADED'; payload: Activity[] }
  | { type: 'ADD_OPTIMISTIC'; payload: ActivityWithMeta }
  | { type: 'CONFIRM'; tempId: string; payload: Activity }
  | { type: 'ROLLBACK'; tempId: string }
  | { type: 'REORDER'; fromIdx: number; toIdx: number }
  | { type: 'DELETE'; id: string }

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10
}

function enrich(items: ActivityWithMeta[]): ActivityWithMeta[] {
  return items.map((item, i) => {
    const next = items[i + 1]
    return {
      ...item,
      distanceToNextKm:
        next && item.lat != null && item.lng != null && next.lat != null && next.lng != null
          ? haversineKm(item.lat, item.lng, next.lat, next.lng)
          : undefined,
    }
  })
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { ...state, isLoading: true }

    case 'LOADED':
      return {
        isLoaded: true,
        isLoading: false,
        items: enrich(
          [...action.payload].sort((a, b) => a.order_index - b.order_index)
        ),
      }

    case 'ADD_OPTIMISTIC':
      return { ...state, items: enrich([...state.items, action.payload]) }

    case 'CONFIRM':
      return {
        ...state,
        items: enrich(
          state.items.map((it) => (it.id === action.tempId ? action.payload : it))
        ),
      }

    case 'ROLLBACK':
      return { ...state, items: state.items.filter((it) => it.id !== action.tempId) }

    case 'REORDER':
      return {
        ...state,
        items: enrich(arrayMove(state.items, action.fromIdx, action.toIdx)),
      }

    case 'DELETE':
      return {
        ...state,
        items: enrich(state.items.filter((it) => it.id !== action.id)),
      }

    default:
      return state
  }
}

/* ── Hook ──────────────────────────────────────────────────── */

export function useStopActivities(stopId: string) {
  const [state, dispatch] = useReducer(reducer, {
    items: [],
    isLoaded: false,
    isLoading: false,
  })

  // Track load state via refs so `load` has a stable identity
  const loadedRef = useRef(false)
  const loadingRef = useRef(false)

  // Debounce ref for order persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Lazy fetch ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (loadedRef.current || loadingRef.current) return
    loadingRef.current = true
    dispatch({ type: 'LOADING' })
    const supabase = createClient()
    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('stop_id', stopId)
      .order('order_index')
    loadedRef.current = true
    loadingRef.current = false
    dispatch({ type: 'LOADED', payload: (data ?? []) as Activity[] })
  }, [stopId])

  /* ── Optimistic add ─────────────────────────────────────── */
  const add = useCallback(async (activity: Omit<Activity, 'id' | 'created_at'>) => {
    const tempId = `temp-${Date.now()}`
    dispatch({
      type: 'ADD_OPTIMISTIC',
      payload: { ...activity, id: tempId, created_at: new Date().toISOString() },
    })
    const supabase = createClient()
    const { data, error } = await supabase
      .from('activities')
      .insert(activity)
      .select()
      .single()
    if (error) {
      dispatch({ type: 'ROLLBACK', tempId })
    } else {
      dispatch({ type: 'CONFIRM', tempId, payload: data as Activity })
    }
  }, [])

  /* ── Optimistic reorder ─────────────────────────────────── */
  const reorder = useCallback((fromIdx: number, toIdx: number) => {
    dispatch({ type: 'REORDER', fromIdx, toIdx })
  }, [])

  /* ── Debounced persist of new order to Supabase ─────────── */
  const persistOrder = useCallback((orderedItems: ActivityWithMeta[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      await Promise.all(
        orderedItems
          .filter((it) => !it.id.startsWith('temp-'))
          .map((it, idx) =>
            supabase.from('activities').update({ order_index: idx }).eq('id', it.id)
          )
      )
    }, 400)
  }, [])

  /* ── Delete ─────────────────────────────────────────────── */
  const remove = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE', id })
    const supabase = createClient()
    await supabase.from('activities').delete().eq('id', id)
  }, [])

  return { state, load, add, reorder, persistOrder, remove }
}
