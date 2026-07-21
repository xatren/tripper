'use client'

import type { ReactNode } from 'react'
import { tokens } from '@/components/mobile/tokens'

/*
 * LEGACY ALIASES of the design tokens in app/globals.css (--color-accent,
 * --glass-standard-*, …). They must stay literal: SVG presentation attributes
 * (`stroke={ACCENT}`) and alpha interpolations (`` `${ACCENT}22` ``) can't
 * consume `var()` strings. New code should import `tokens` from
 * '@/components/mobile' and use inline `style` instead.
 */
export const ACCENT = '#f5a623'
export const ACCENT_LIGHT = '#f8c04a'
export const ACCENT_DARK = '#e8821a'
export const ACCENT_GRADIENT = 'linear-gradient(135deg, #f5a623, #f8c04a)'
export const GLASS_FILL = 'rgba(255,255,255,.055)'
export const GLASS_BORDER = 'rgba(255,255,255,.13)'

/** Trip workspace's top-level primary-nav destinations. */
export type Section = 'overview' | 'plan' | 'explore' | 'bookings' | 'more'

/** Full-screen domains reachable through the More sheet. */
export type MoreDestination = 'budget' | 'packing' | 'journal' | 'members' | 'activity' | 'settings' | 'export' | 'offline'

export interface SoonBadgeProps {
  label?: string
}

/** Small pill marking a not-yet-available option — matches the existing inline "SOON" tag style. */
export function SoonBadge({ label = 'SOON' }: SoonBadgeProps) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,166,35,.15)', border: '1px solid rgba(245,166,35,.35)', color: tokens.accentLight, letterSpacing: '.05em' }}>
      {label}
    </span>
  )
}

export interface SheetOptionRowProps {
  icon: ReactNode
  label: string
  hint?: string
  available: boolean
  onSelect: () => void
}

/** One row inside a sheet-style option list (More sheet, Add sheet) — enabled or "Soon". */
export function SheetOptionRow({ icon, label, hint, available, onSelect }: SheetOptionRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 10px',
        background: 'none', border: 'none', borderBottom: `1px solid ${tokens.glassStandardBorder}`, textAlign: 'left',
        cursor: 'pointer', fontFamily: 'inherit', opacity: available ? 1 : 0.55, minHeight: 44,
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: tokens.radius12, background: tokens.glassStandardFill, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: tokens.accentLight }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', color: tokens.textPrimary, fontWeight: 700, fontSize: 14 }}>{label}</span>
        {hint && <span style={{ display: 'block', color: tokens.textMuted, fontSize: 12, marginTop: 1 }}>{hint}</span>}
      </span>
      {!available && <SoonBadge />}
    </button>
  )
}

export interface RetryCardProps {
  title: string
  hint?: string
  onRetry: () => void
}

/** Shared failure state used by independently loaded trip domains. */
export function RetryCard({ title, hint, onRetry }: RetryCardProps) {
  return (
    <div role="alert" style={{ width: '100%', background: tokens.glassStandardFill, border: '1px solid rgba(239,68,68,.3)', borderRadius: tokens.radius20, padding: '22px 18px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
        <path d="M12 3L22 20H2L12 3Z" stroke="#f87171" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M12 9.5V14M12 17h.01" stroke="#f87171" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: tokens.textPrimary }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: tokens.textMuted, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
      <button
        onClick={onRetry}
        style={{ marginTop: 14, padding: '10px 24px', borderRadius: tokens.radius12, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', color: tokens.textPrimary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Try again
      </button>
    </div>
  )
}
