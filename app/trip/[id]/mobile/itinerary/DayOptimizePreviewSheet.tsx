'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDistanceUnit, formatDistanceValue } from '@/lib/settings'
import { ACCENT_LIGHT, ACCENT_DARK } from '../domain-ui'
import { DUSK } from '@/components/design/tokens'
import type { DayOptimizationPreview } from './route-optimizer'

export interface DayOptimizePreviewSheetProps {
  preview: DayOptimizationPreview | null
  onApply: () => void
  onDismiss: () => void
}

/**
 * Before/after comparison for a single day's route optimization — items only
 * move once the user taps Apply. Adapted from PlanRouteDomain's
 * OptimizePreviewSheet (trip-wide stops) for the day-scoped itinerary case:
 * adds locked-item and skipped-section callouts, since a day can have items
 * an optimization run couldn't touch.
 */
export function DayOptimizePreviewSheet({ preview, onApply, onDismiss }: DayOptimizePreviewSheetProps) {
  const distanceUnit = useDistanceUnit()
  const dismissRef = useRef<HTMLButtonElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)
  const distanceText = preview ? formatDistanceValue(Math.abs(preview.savedDistanceMeters), distanceUnit) : ''
  const min = preview ? Math.round(Math.abs(preview.savedDurationSeconds) / 60) : 0
  const improved = (preview?.savedDistanceMeters ?? 0) > 0 || (preview?.savedDurationSeconds ?? 0) > 0
  const lockedCount = preview?.lockedItemIds.length ?? 0
  const skippedCount = preview?.skippedSegments.length ?? 0

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
            aria-labelledby="day-optimize-preview-title"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, borderRadius: 20, padding: 20,
              background: 'rgba(14,14,34,.97)', border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 16px 48px rgba(0,0,0,.5)', backdropFilter: 'blur(24px)',
              maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div id="day-optimize-preview-title" style={{ fontSize: 16, fontWeight: 800, color: DUSK.textPrimary, letterSpacing: '-0.01em' }}>
              Optimized day
            </div>
            <div style={{ fontSize: 13, color: DUSK.textMuted, marginTop: 6, lineHeight: 1.5 }}>
              {improved
                ? 'Reordering this day shortens the drive. Apply to update the plan.'
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

            {lockedCount > 0 && (
              <div style={{ fontSize: 12, color: DUSK.textMuted, marginTop: 12 }}>
                {lockedCount} locked item{lockedCount === 1 ? '' : 's'} stayed in place.
              </div>
            )}

            {skippedCount > 0 && (
              <div style={{ borderRadius: 12, padding: '10px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', marginTop: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: DUSK.textSecondary, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                  {skippedCount} section{skippedCount === 1 ? '' : 's'} left unchanged
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {preview.skippedSegments.map((segment, index) => (
                    <li key={index} style={{ fontSize: 12, color: DUSK.textMuted, lineHeight: 1.4 }}>
                      {segment.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                ref={dismissRef}
                onClick={onDismiss}
                style={{
                  flex: 1, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.85)',
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
                  border: 'none', color: '#1a1004', fontSize: 14, fontWeight: 700,
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
