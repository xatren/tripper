'use client'

import { useEffect, useId, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DUSK } from '@/components/design/tokens'

// Inline-styled (not the Radix alert-dialog) so it matches the app's dark
// glass screens without depending on the Tailwind theme variables.

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()

  // Escape closes; Tab cycles between the two buttons; focus returns to the
  // previously focused element when the dialog goes away.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
        next?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,.6)', padding: 24,
            fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, borderRadius: 20, padding: 20,
              background: 'rgba(14,14,34,.97)', border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 16px 48px rgba(0,0,0,.5)', backdropFilter: 'blur(24px)',
            }}
          >
            <div id={titleId} style={{ fontSize: 16, fontWeight: 800, color: DUSK.textPrimary, letterSpacing: '-0.01em' }}>{title}</div>
            <div id={messageId} style={{ fontSize: 13, color: DUSK.textMuted, marginTop: 6, lineHeight: 1.5 }}>{message}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                ref={cancelRef}
                onClick={onCancel}
                style={{
                  flex: 1, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.85)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                onClick={onConfirm}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: 'linear-gradient(145deg, #ef4444, #b91c1c)',
                  border: 'none', color: DUSK.textPrimary, fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(239,68,68,.3)',
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
