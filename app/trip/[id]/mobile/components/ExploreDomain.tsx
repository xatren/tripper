'use client'

import { ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL } from '../domain-ui'

/** Placeholder top-level Explore screen — discovery/recommendations land in a later stage. */
export function ExploreDomain() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 320, padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 6-6 2 2-6 6-2z" /></svg>
      </div>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Explore is coming soon</div>
      <div style={{ color: 'rgba(215,215,255,.6)', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        Place recommendations and nearby ideas for your route will show up here in a future update.
      </div>
    </div>
  )
}
