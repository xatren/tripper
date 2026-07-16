'use client'

import { useSyncExternalStore } from 'react'
import { tokens } from './tokens'

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

const getSnapshot = () => navigator.onLine
// Assume online during SSR so the banner never flashes on first paint.
const getServerSnapshot = () => true

/**
 * Connectivity banner. Renders nothing while online; announces politely when
 * the connection drops (aria-live on the always-mounted wrapper so the state
 * change is picked up without being assertive).
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return (
    <div aria-live="polite" role="status">
      {!online && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.32)',
            borderRadius: tokens.radius12, color: tokens.warning, fontSize: 12.5, fontWeight: 700,
          }}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flex: 'none' }}>
            <path d="M1 1l22 22M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 013.4-2.2M12 5c3.5 0 6.9 1.4 9.4 3.9M2.6 8.9A14.9 14.9 0 016.2 6.4" />
            <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span style={{ color: tokens.textSecondary }}>You&apos;re offline — changes will sync when you reconnect.</span>
        </div>
      )}
    </div>
  )
}
