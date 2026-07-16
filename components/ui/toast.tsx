'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Module-level pub/sub instead of React context so any client module can call
// showToast() without provider plumbing; each page renders one <Toaster />.

export type ToastKind = 'error' | 'success' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
}

type Listener = (t: ToastItem) => void
let listeners: Listener[] = []
let nextId = 1

/** Fire-and-forget notification. No-op if no <Toaster /> is mounted. */
export function showToast(message: string, kind: ToastKind = 'info', action?: ToastAction) {
  const item: ToastItem = { id: nextId++, message, kind, action }
  listeners.forEach((l) => l(item))
}

const KIND_META: Record<ToastKind, { border: string; iconColor: string; icon: React.ReactNode }> = {
  error: {
    border: 'rgba(239,68,68,.45)',
    iconColor: '#f87171',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.4" stroke="#f87171" strokeWidth="1.6" />
        <path d="M8 4.8V8.6M8 11h.01" stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  success: {
    border: 'rgba(74,222,128,.45)',
    iconColor: '#4ade80',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  info: {
    border: 'rgba(245,166,35,.45)',
    iconColor: '#f8c04a',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.4" stroke="#f8c04a" strokeWidth="1.6" />
        <path d="M8 7.4V11M8 5h.01" stroke="#f8c04a" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
}

const TOAST_DURATION_MS = 3800
/** Toasts with an action stay longer so the user can actually reach the button. */
const TOAST_ACTION_DURATION_MS = 7000

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const add: Listener = (t) => {
      setToasts((prev) => [...prev.slice(-2), t])
      const ms = t.action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS
      timers.push(setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ms))
    }
    listeners.push(add)
    return () => {
      listeners = listeners.filter((l) => l !== add)
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 92,
        zIndex: 100, width: 'calc(100% - 32px)', maxWidth: 398,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
        fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : undefined}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
              borderRadius: 14, background: 'rgba(12,12,30,.92)', backdropFilter: 'blur(20px)',
              border: `1px solid ${KIND_META[t.kind].border}`,
              boxShadow: '0 8px 28px rgba(0,0,0,.4)', pointerEvents: 'auto',
            }}
          >
            <span style={{ flex: 'none', display: 'flex' }}>{KIND_META[t.kind].icon}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.92)', lineHeight: 1.4 }}>
              {t.message}
            </span>
            {t.action && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                  t.action!.onClick()
                }}
                style={{
                  flex: 'none', padding: '6px 12px', borderRadius: 9,
                  background: `${KIND_META[t.kind].iconColor}1f`,
                  border: `1px solid ${KIND_META[t.kind].border}`,
                  color: KIND_META[t.kind].iconColor, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ width: 44, height: 44, margin: '-8px -10px -8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', padding: 0, border: 0, background: 'transparent', color: 'rgba(255,255,255,.65)', cursor: 'pointer', fontSize: 18 }}
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
