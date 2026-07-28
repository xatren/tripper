'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DUSK } from '@/components/design/tokens'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import { ACCENT_DARK, ACCENT_LIGHT } from '../domain-ui'

/** Before/after comparison shown after "Optimize" — stops only reorder once the user taps Apply. */
export function OptimizePreviewSheet({
  preview, onApply, onDismiss,
}: {
  preview: { savedDistanceMeters: number; savedDurationSeconds: number } | null
  onApply: () => void
  onDismiss: () => void
}) {
  const distanceUnit = useDistanceUnit()
  const dismissRef = useRef<HTMLButtonElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)
  const distanceText = preview ? formatDistanceValue(Math.abs(preview.savedDistanceMeters), distanceUnit) : ''
  const min = preview ? Math.round(Math.abs(preview.savedDurationSeconds) / 60) : 0
  const improved = (preview?.savedDistanceMeters ?? 0) > 0 || (preview?.savedDurationSeconds ?? 0) > 0

  useEffect(() => {
    if (!preview) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => dismissRef.current?.focus())
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const target = document.activeElement === dismissRef.current && !e.shiftKey ? applyRef.current : dismissRef.current
        target?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [preview, onDismiss])

  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,.6)', padding: 24,
            fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="optimize-preview-title"
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
            <div id="optimize-preview-title" style={{ fontSize: 16, fontWeight: 800, color: DUSK.textPrimary, letterSpacing: '-0.01em' }}>
              Optimized route
            </div>
            <div style={{ fontSize: 13, color: DUSK.textSecondary, marginTop: 6, lineHeight: 1.5 }}>
              {improved
                ? "Reordering your middle stops shortens the drive. Apply to update your route."
                : "This order doesn't save distance or time, but you can still apply it if you prefer the sequence."}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <div style={{ flex: 1, borderRadius: 14, padding: '12px 14px', background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>
                  {improved ? '−' : ''}{distanceText}
                </div>
                <div style={{ fontSize: 11, color: DUSK.textMuted, marginTop: 2 }}>distance</div>
              </div>
              <div style={{ flex: 1, borderRadius: 14, padding: '12px 14px', background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>
                  {improved ? '−' : ''}{min} min
                </div>
                <div style={{ fontSize: 11, color: DUSK.textMuted, marginTop: 2 }}>drive time</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                ref={dismissRef}
                onClick={onDismiss}
                style={{
                  flex: 1, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)', color: DUSK.textSecondary,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Keep current
              </button>
              <button
                ref={applyRef}
                onClick={onApply}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`,
                  border: 'none', color: DUSK.onAmber, fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(245,166,35,.3)',
                }}
              >
                Apply
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
