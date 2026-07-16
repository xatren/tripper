'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface MobileBottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Id for aria-labelledby; defaults to a derived id. */
  titleId?: string
  children: ReactNode
}

const EXIT_MS = 250 // keep in sync with --motion-normal

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Dependency-free modal bottom sheet on the elevated glass tier.
 * Dialog semantics (role/aria-modal/labelledby), focus trap, Escape/backdrop
 * close, focus return to the trigger, and keyboard-aware bottom padding via
 * visualViewport. Animates transform/opacity only; instant under
 * prefers-reduced-motion.
 */
export function MobileBottomSheet({ open, onClose, title, titleId, children }: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const generatedId = useId()
  const labelId = titleId ?? generatedId

  // Mount/unmount around the enter/exit transition.
  useEffect(() => {
    if (open) {
      setMounted(true)
      if (prefersReducedMotion()) {
        setEntered(true)
        return
      }
      // Double rAF: element must be committed at its offscreen position first.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
      return () => cancelAnimationFrame(raf)
    }
    setEntered(false)
    if (prefersReducedMotion()) {
      setMounted(false)
      return
    }
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [open])

  // Focus management + Escape + focus trap while open.
  useEffect(() => {
    if (!open) return
    returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null
    sheetRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  // Keyboard-aware: pad the sheet above the on-screen keyboard.
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardInset(inset)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setKeyboardInset(0)
    }
  }, [open])

  if (!mounted) return null

  const reduced = prefersReducedMotion()
  const transition = reduced
    ? 'none'
    : `transform var(--motion-normal) var(--ease-out), opacity var(--motion-normal) var(--ease-out)`

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
        opacity: entered ? 1 : 0, transition: reduced ? 'none' : 'opacity var(--motion-normal) var(--ease-out)',
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated"
        style={{
          width: '100%', maxWidth: 480,
          borderBottom: 'none', borderRadius: 'var(--radius-24) var(--radius-24) 0 0',
          padding: '20px 20px 20px',
          paddingBottom: `max(20px, env(safe-area-inset-bottom, 0px), ${keyboardInset}px)`,
          maxHeight: '80svh', display: 'flex', flexDirection: 'column',
          outline: 'none',
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, flex: 'none' }} aria-hidden="true">
          <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.22)' }} />
        </div>
        <div id={labelId} style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 16, marginBottom: 14, flex: 'none' }}>
          {title}
        </div>
        <div style={{ overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}
