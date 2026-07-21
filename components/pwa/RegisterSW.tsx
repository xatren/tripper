'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { bindActiveOfflineUser, clearPrivateOfflineData } from '@/lib/offline/db'
import { flushOfflineQueue } from '@/lib/offline/sync'

const TRIPPER_CACHE_PREFIX = 'tripper-'

/** Removes all caches created by Tripper, including older service-worker versions. */
export async function clearTripperCaches() {
  if (typeof window === 'undefined') return

  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_TRIPPER_CACHES' })

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith(TRIPPER_CACHE_PREFIX))
        .map((key) => caches.delete(key))
    )
  }
}

/** Clears public app caches and all private, user-scoped offline data. */
export async function clearTripperDeviceData() {
  await Promise.all([clearTripperCaches(), clearPrivateOfflineData()])
}

/** Registers the offline service worker. Production-only so HMR stays clean in dev. */
export function RegisterSW() {
  useEffect(() => {
    const supabase = createClient()
    let activeUserId: string | null = null
    const bind = (userId: string) => {
      activeUserId = userId
      void bindActiveOfflineUser(userId).catch(() => undefined)
    }
    if (navigator.onLine) void supabase.auth.getUser().then(({ data }) => { if (data.user) bind(data.user.id) })
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        activeUserId = null
        void clearTripperDeviceData().catch(() => undefined)
      } else if (session?.user.id) bind(session.user.id)
    })
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TRIPPER_SYNC_REQUESTED' && activeUserId) void flushOfflineQueue(activeUserId)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is progressive enhancement — never block the app on it.
      })
    }
    return () => {
      authListener.subscription.unsubscribe()
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [])
  return null
}
