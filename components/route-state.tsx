'use client'

import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react'

const shellStyle = {
  minHeight: '100svh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'linear-gradient(145deg, #06061c 0%, #0a1020 55%, #071216 100%)',
  color: '#fff',
  fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
} as const

export function RouteLoading() {
  return (
    <main style={shellStyle}>
      <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <LoaderCircle aria-hidden="true" style={{ width: 30, height: 30, color: '#f5a623', animation: 'spin 1s linear infinite' }} />
        <span style={{ color: 'rgba(215,215,255,.68)', fontSize: 14 }}>Loading your trip data…</span>
      </div>
    </main>
  )
}

export function RouteError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <main style={shellStyle}>
      <div role="alert" style={{ width: '100%', maxWidth: 390, padding: 24, borderRadius: 22, textAlign: 'center', background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.12)', backdropFilter: 'blur(18px)' }}>
        <AlertTriangle aria-hidden="true" style={{ width: 34, height: 34, margin: '0 auto 14px', color: '#f5a623' }} />
        <h1 style={{ margin: '0 0 8px', fontSize: 21 }}>We couldn&apos;t load this page</h1>
        <p style={{ margin: '0 auto 20px', maxWidth: 310, color: 'rgba(215,215,255,.65)', fontSize: 14, lineHeight: 1.55 }}>
          Your data is safe. This may be a temporary connection or service problem.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{ minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 18px', border: 0, borderRadius: 13, background: 'linear-gradient(135deg, #f5a623, #f8c04a)', color: '#1a0800', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}
        >
          <RefreshCw aria-hidden="true" style={{ width: 17, height: 17 }} />
          Try again
        </button>
      </div>
    </main>
  )
}
