'use client'

import { useEffect } from 'react'

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

/** Registers the offline service worker. Production-only so HMR stays clean in dev. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is progressive enhancement — never block the app on it.
    })
  }, [])
  return null
}
