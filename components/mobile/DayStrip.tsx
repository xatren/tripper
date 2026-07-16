'use client'

import { useCallback, useRef } from 'react'
import { tokens } from './tokens'

export interface DayStripDay {
  id: string
  /** Short label, e.g. "Day 3" or "Wed". */
  label: string
  /** Secondary line, e.g. "Sep 14" or the stop name. */
  sublabel?: string
  isToday?: boolean
}

export interface DayStripProps {
  days: DayStripDay[]
  selectedId: string
  onSelect: (id: string) => void
  'aria-label'?: string
}

/**
 * Horizontally scrolling day selector. Roving tabindex + arrow keys; the
 * selected day is marked via aria-current and today carries a visible "Today"
 * tag (never color alone).
 */
export function DayStrip({ days, selectedId, onSelect, 'aria-label': ariaLabel = 'Trip days' }: DayStripProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())

  const focusAndSelect = useCallback(
    (index: number) => {
      const day = days[index]
      if (!day) return
      onSelect(day.id)
      const el = buttonRefs.current.get(day.id)
      el?.focus()
      el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })
    },
    [days, onSelect],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const current = days.findIndex((d) => d.id === selectedId)
      if (current === -1) return
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          focusAndSelect(Math.min(current + 1, days.length - 1))
          break
        case 'ArrowLeft':
          event.preventDefault()
          focusAndSelect(Math.max(current - 1, 0))
          break
        case 'Home':
          event.preventDefault()
          focusAndSelect(0)
          break
        case 'End':
          event.preventDefault()
          focusAndSelect(days.length - 1)
          break
      }
    },
    [days, selectedId, focusAndSelect],
  )

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 16px 6px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {days.map((day) => {
        const selected = day.id === selectedId
        return (
          <button
            key={day.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(day.id, el)
              else buttonRefs.current.delete(day.id)
            }}
            type="button"
            tabIndex={selected ? 0 : -1}
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelect(day.id)}
            style={{
              flex: 'none', minWidth: 64, minHeight: 52, padding: '8px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              borderRadius: tokens.radius16, cursor: 'pointer', fontFamily: 'inherit',
              background: selected ? 'rgba(245,166,35,.16)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${selected ? 'rgba(245,140,0,.4)' : 'rgba(255,255,255,.1)'}`,
              color: selected ? tokens.accentLight : tokens.textSecondary,
              transition: `background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard)`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{day.label}</span>
            {day.sublabel && <span style={{ fontSize: 11, fontWeight: 500, color: selected ? tokens.textSecondary : tokens.textMuted, whiteSpace: 'nowrap' }}>{day.sublabel}</span>}
            {day.isToday && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: tokens.accentLight }}>
                <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                TODAY
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
