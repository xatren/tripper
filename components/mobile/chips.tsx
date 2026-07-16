import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { tokens } from './tokens'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'ai' | 'neutral'

/* Soft tint fills stay literal: they are alpha blends of the status colors and
   CSS has no widely-supported way to derive them from the tokens at runtime. */
const TONES: Record<StatusTone, { bg: string; border: string; text: string }> = {
  success: { bg: 'rgba(30,140,90,.14)', border: 'rgba(30,180,110,.32)', text: tokens.successSoft },
  warning: { bg: 'rgba(251,191,36,.13)', border: 'rgba(251,191,36,.32)', text: tokens.warning },
  danger: { bg: 'rgba(239,68,68,.13)', border: 'rgba(239,68,68,.32)', text: tokens.danger },
  info: { bg: 'rgba(96,165,250,.13)', border: 'rgba(96,165,250,.32)', text: tokens.info },
  accent: { bg: 'rgba(245,166,35,.14)', border: 'rgba(245,166,35,.35)', text: tokens.accentLight },
  ai: { bg: 'rgba(136,136,228,.16)', border: 'rgba(136,136,228,.36)', text: tokens.ai },
  neutral: { bg: 'rgba(255,255,255,.05)', border: 'rgba(255,255,255,.12)', text: tokens.textSecondary },
}

export interface StatusChipProps {
  tone?: StatusTone
  /** Pair with the label so color is never the only signal. */
  icon?: ReactNode
  children: ReactNode
  style?: CSSProperties
}

/** Small non-interactive status pill — icon + text so state reads without color. */
export function StatusChip({ tone = 'neutral', icon, children, style }: StatusChipProps) {
  const t = TONES[tone]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: tokens.radiusFull,
        background: t.bg, border: `1px solid ${t.border}`, color: t.text,
        fontSize: 11.5, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none' }}>{icon}</span>}
      {children}
    </span>
  )
}

export interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  selected: boolean
  icon?: ReactNode
  children: ReactNode
}

/** Toggleable filter pill. Selection is exposed via aria-pressed and shown with a check mark, not just color. */
export function FilterChip({ selected, icon, children, style, ...rest }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        minHeight: 44, padding: '10px 14px', borderRadius: tokens.radiusFull,
        background: selected ? 'rgba(245,166,35,.18)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${selected ? 'rgba(245,166,35,.45)' : 'rgba(255,255,255,.1)'}`,
        color: selected ? tokens.accentLight : tokens.textSecondary,
        fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        transition: `background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard)`,
        ...style,
      }}
      {...rest}
    >
      {selected && (
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
          <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {icon && <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none' }}>{icon}</span>}
      {children}
    </button>
  )
}
