'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { levelFromGesture, type SheetLevel } from '@/lib/mobile/draggable-sheet'
import styles from './DraggableSheet.module.css'

export type { SheetLevel }
export { levelFromGesture }

/** History-state key marking "the sheet opened a level", so Android/browser back
 * collapses it instead of leaving the page. Generic across every DraggableSheet
 * consumer — Map Home used to spell this `mapHomeRoutePreview`. */
const HISTORY_KEY = 'draggableSheetOpen'

export interface DraggableSheetProps {
  level: SheetLevel
  onLevelChange: (level: SheetLevel) => void
  /** Heights in px per level, given the viewport height. Owner-supplied so each screen keeps its exact numbers. */
  heightFor: (level: SheetLevel, viewportHeight: number) => number
  /** Wire browser-back to collapse (Map Home's history.pushState trick). Default true. */
  historyIntegration?: boolean
  label: string
  header?: ReactNode
  children: ReactNode
  className?: string
  /**
   * `'rail'` renders the desktop layout from §13: a fixed-position, full-height
   * strip with no drag handle. The caller is expected to also pass
   * `level="expanded"` and `historyIntegration={false}` in that mode — this
   * prop only changes layout, not level policy, so it stays orthogonal to the
   * mobile `SheetLevel` state machine.
   */
  variant?: 'sheet' | 'rail'
}

/**
 * The three-level draggable results sheet, extracted from Map Home
 * (`app/dashboard/DashboardClient.tsx`) so Discover can reuse the exact same
 * drag mechanics, history integration, and accessibility contract instead of a
 * second implementation. Pointer capture, a +-110px clamp, a +-45px level
 * threshold, and a `dragged` ref guard so a drag never also fires the handle's
 * tap-to-cycle behavior.
 */
export function DraggableSheet({
  level,
  onLevelChange,
  heightFor,
  historyIntegration = true,
  label,
  header,
  children,
  className,
  variant = 'sheet',
}: DraggableSheetProps) {
  const isRail = variant === 'rail'
  const [viewportHeight, setViewportHeight] = useState(800)
  const [dragOffset, setDragOffset] = useState(0)
  const drag = useRef<{ y: number; pointerId: number } | null>(null)
  const dragged = useRef(false)

  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight)
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!historyIntegration) return
    const onPopState = () => onLevelChange('collapsed')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // onLevelChange is expected to be a stable setState reference; re-running
    // this on every render identity change would attach/detach on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIntegration])

  const changeLevel = useCallback((next: SheetLevel) => {
    if (next === level) return
    if (next === 'collapsed') {
      if (historyIntegration && window.history.state?.[HISTORY_KEY]) window.history.back()
      else onLevelChange('collapsed')
      return
    }
    if (historyIntegration && level === 'collapsed') {
      window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, '')
    }
    onLevelChange(next)
  }, [historyIntegration, level, onLevelChange])

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    drag.current = { y: event.clientY, pointerId: event.pointerId }
    dragged.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return
    const delta = event.clientY - drag.current.y
    if (Math.abs(delta) > 5) dragged.current = true
    setDragOffset(Math.max(-110, Math.min(110, delta)))
  }
  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return
    const delta = event.clientY - drag.current.y
    changeLevel(levelFromGesture(level, delta))
    drag.current = null
    setDragOffset(0)
  }
  const handlePointerCancel = () => { drag.current = null; setDragOffset(0) }

  const handleClick = () => {
    if (dragged.current) { dragged.current = false; return }
    changeLevel(level === 'collapsed' ? 'half' : level === 'half' ? 'expanded' : 'half')
  }

  const height = heightFor(level, viewportHeight)

  return (
    <section
      className={[styles.sheet, isRail ? styles.rail : styles[level], className].filter(Boolean).join(' ')}
      style={isRail ? undefined : { height, transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
      aria-label={label}
    >
      {!isRail && (
        <button
          type="button"
          className={styles.handle}
          aria-expanded={level !== 'collapsed'}
          aria-label={level === 'expanded' ? `Collapse ${label}` : `Expand ${label}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleClick}
        ><span /></button>
      )}

      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.content}>{children}</div>
    </section>
  )
}
