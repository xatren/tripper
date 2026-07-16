import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { tokens } from './tokens'

export interface MobileListRowProps {
  /** Icon/avatar slot, rendered in a 34px rounded box. */
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Short trailing text (price, count, date). */
  metadata?: ReactNode
  /** Trailing control slot (chevron, button, switch). */
  trailing?: ReactNode
  onClick?: () => void
  /** Renders the row as a link instead of a button/div. */
  href?: string
  linkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'style'>
  /** Hide the hairline divider under the row (e.g. last row of a card). */
  divider?: boolean
  style?: CSSProperties
}

const rowStyle = (interactive: boolean, divider: boolean): CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
  minHeight: 52, padding: '10px 0',
  background: 'none', border: 'none',
  borderBottom: divider ? '1px solid rgba(255,255,255,.06)' : 'none',
  textAlign: 'left', textDecoration: 'none', color: 'inherit',
  cursor: interactive ? 'pointer' : 'default', fontFamily: 'inherit',
})

/**
 * Dense data row for opaque list surfaces (bookings, budget, packing, journal
 * indexes). Deliberately blur-free: rows sit on a solid `--color-surface-*`
 * card so long lists stay readable and cheap to paint.
 */
export function MobileListRow({ leading, title, subtitle, metadata, trailing, onClick, href, linkProps, divider = true, style }: MobileListRowProps) {
  const body = (
    <>
      {leading && (
        <span
          aria-hidden="true"
          style={{
            width: 34, height: 34, borderRadius: tokens.radius12, flex: 'none',
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: tokens.textSecondary, fontSize: 13, fontWeight: 700,
          }}
        >
          {leading}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', color: tokens.textPrimary, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ display: 'block', color: tokens.textMuted, fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </span>
        )}
      </span>
      {metadata && <span style={{ flex: 'none', color: tokens.textMuted, fontSize: 12.5, fontWeight: 600 }}>{metadata}</span>}
      {trailing && <span style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>{trailing}</span>}
    </>
  )

  const base = rowStyle(!!(onClick || href), divider)
  if (href) {
    return (
      <a href={href} onClick={onClick} style={{ ...base, ...style }} {...linkProps}>
        {body}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...base, ...style }}>
        {body}
      </button>
    )
  }
  return <div style={{ ...base, ...style }}>{body}</div>
}
