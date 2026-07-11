'use client'

import { AnimatePresence, motion } from 'framer-motion'

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
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{title}</div>
            <div style={{ fontSize: 13, color: 'rgba(215,215,255,.65)', marginTop: 6, lineHeight: 1.5 }}>{message}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
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
                onClick={onConfirm}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: 'linear-gradient(145deg, #ef4444, #b91c1c)',
                  border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
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
