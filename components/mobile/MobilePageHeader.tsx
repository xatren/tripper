import type { CSSProperties, ReactNode } from 'react'
import { tokens } from './tokens'

export interface MobilePageHeaderProps {
  title: string
  subtitle?: string
  /** Back button / avatar slot, left of the title. */
  leading?: ReactNode
  /** Action buttons, right of the title. */
  trailing?: ReactNode
  /** overlay = scrimmed gradient over a map/photo; solid = normal in-flow header. */
  variant?: 'solid' | 'overlay'
  style?: CSSProperties
}

/**
 * Page-level mobile header with safe-area padding. The overlay variant paints
 * the top scrim token so title text keeps AA contrast over maps and photos.
 */
export function MobilePageHeader({ title, subtitle, leading, trailing, variant = 'solid', style }: MobilePageHeaderProps) {
  const overlay = variant === 'overlay'
  const textShadow = overlay ? '0 2px 12px rgba(0,0,0,.6)' : undefined
  return (
    <header
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, flex: 'none',
        padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))',
        ...(overlay
          ? { position: 'absolute' as const, top: 0, left: 0, right: 0, zIndex: 2, background: tokens.scrimTop, pointerEvents: 'none' as const }
          : {}),
        ...style,
      }}
    >
      {leading && <div style={{ flex: 'none', pointerEvents: 'auto' }}>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0 4px', pointerEvents: 'auto' }}>
        <div style={{ color: tokens.textPrimary, fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ color: tokens.textSecondary, fontWeight: 500, fontSize: 12.5, marginTop: 3, textShadow }}>{subtitle}</div>
        )}
      </div>
      {trailing && <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>{trailing}</div>}
    </header>
  )
}
