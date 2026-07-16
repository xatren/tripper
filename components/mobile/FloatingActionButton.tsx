import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { tokens } from './tokens'

export interface FloatingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — the FAB is icon-only. */
  'aria-label': string
  /** Defaults to a plus icon. */
  icon?: ReactNode
  /** Distance from the bottom edge, before safe-area inset (default clears the primary nav). */
  bottomOffset?: number
}

/**
 * Primary add CTA. The one place the accent gradient is used at full strength
 * on a screen — keep a single FAB per screen so the primary action stays
 * unambiguous.
 */
export function FloatingActionButton({ icon, bottomOffset = 96, style, ...rest }: FloatingActionButtonProps) {
  return (
    <button
      type="button"
      style={{
        position: 'fixed', right: 18,
        bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
        width: 56, height: 56, borderRadius: tokens.radiusFull,
        background: tokens.accentCtaGradient, border: 'none', color: tokens.textOnAccent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 32px rgba(245,140,0,.45), 0 8px 20px rgba(0,0,0,.3)',
        cursor: 'pointer', zIndex: 5,
        transition: `transform var(--motion-fast) var(--ease-spring)`,
        ...style,
      }}
      {...rest}
    >
      {icon ?? (
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  )
}
