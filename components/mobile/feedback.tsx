import type { CSSProperties, ReactNode } from 'react'
import { tokens } from './tokens'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  /** Optional call to action rendered under the copy. */
  action?: ReactNode
  style?: CSSProperties
}

/** Centered empty screen/section state. */
export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 220, padding: '40px 16px', textAlign: 'center', ...style }}>
      {icon && (
        <span
          aria-hidden="true"
          style={{
            width: 56, height: 56, borderRadius: tokens.radiusFull, marginBottom: 8,
            background: tokens.glassSubtleFill, border: `1px solid ${tokens.glassSubtleBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.accentLight,
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ color: tokens.textPrimary, fontSize: 14.5, fontWeight: 700 }}>{title}</span>
      {description && <span style={{ color: tokens.textMuted, fontSize: 12.5, lineHeight: 1.5, maxWidth: 300 }}>{description}</span>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

export interface InlineErrorProps {
  children: ReactNode
  /** Optional retry handler — renders a compact "Try again" button. */
  onRetry?: () => void
  style?: CSSProperties
}

/** Compact in-flow error strip (form/section level; RetryCard stays the full-width domain failure state). */
export function InlineError({ children, onRetry, style }: InlineErrorProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
        borderRadius: tokens.radius12, color: tokens.textSecondary, fontSize: 12.5, fontWeight: 600,
        ...style,
      }}
    >
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', color: tokens.danger }}>
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.8V8.6M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            flex: 'none', padding: '6px 12px', minHeight: 32, borderRadius: tokens.radius8,
            background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)',
            color: tokens.textPrimary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

export interface SkeletonBlockProps {
  height?: number | string
  width?: number | string
  radius?: number | string
  style?: CSSProperties
}

/**
 * Loading placeholder. Animates opacity only (composited); the global
 * `skeleton-pulse` keyframe is disabled under prefers-reduced-motion.
 * Decorative — wrap the loading region itself with role="status".
 */
export function SkeletonBlock({ height = 66, width = '100%', radius = tokens.radius16, style }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className="skeleton-pulse"
      style={{
        height, width, borderRadius: radius,
        background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.08)',
        ...style,
      }}
    />
  )
}
