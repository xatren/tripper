'use client'

import { useEffect } from 'react'

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
