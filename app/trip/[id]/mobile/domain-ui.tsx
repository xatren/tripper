'use client'

export const ACCENT = '#f5a623'
export const ACCENT_LIGHT = '#f8c04a'
export const ACCENT_DARK = '#e8821a'
export const GLASS_FILL = 'rgba(255,255,255,.055)'
export const GLASS_BORDER = 'rgba(255,255,255,.13)'

export interface RetryCardProps {
  title: string
  hint?: string
  onRetry: () => void
}

/** Shared failure state used by independently loaded trip domains. */
export function RetryCard({ title, hint, onRetry }: RetryCardProps) {
  return (
    <div role="alert" style={{ width: '100%', background: GLASS_FILL, border: '1px solid rgba(239,68,68,.3)', borderRadius: 20, padding: '22px 18px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
        <path d="M12 3L22 20H2L12 3Z" stroke="#f87171" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M12 9.5V14M12 17h.01" stroke="#f87171" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: 'rgba(215,215,255,.6)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
      <button
        onClick={onRetry}
        style={{ marginTop: 14, padding: '10px 24px', borderRadius: 12, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Try again
      </button>
    </div>
  )
}
