'use client'

import { useState } from 'react'
import type { TripMember } from '@/types'
import { showToast } from '@/components/ui/toast'
import { tokens } from '@/components/mobile'

export interface TripMobileHeaderProps {
  /** overlay = transparent gradient over the map (Plan); solid = opaque glass bar (Explore/Bookings/More screens). */
  variant: 'overlay' | 'solid'
  title: string
  subtitle?: string
  readOnly: boolean
  members: TripMember[]
  tripId: string
  onBack: () => void
  onOpenMore: () => void
  backLabel?: string
}

function initialsFor(member: TripMember) {
  const source = member.profile?.display_name || member.profile?.email || '?'
  return source.trim().charAt(0).toUpperCase() || '?'
}

function AvatarStack({ members }: { members: TripMember[] }) {
  const shown = members.slice(0, 3)
  const overflow = members.length - shown.length
  if (shown.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center' }} aria-label={`${members.length} trip member${members.length === 1 ? '' : 's'}`}>
      {shown.map((member, index) => (
        <div
          key={member.user_id}
          title={member.profile?.display_name || member.profile?.email}
          style={{
            width: 26, height: 26, borderRadius: '50%', background: 'rgba(136,136,228,.28)', border: '2px solid #0a0a1e',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10.5, fontWeight: 700,
            marginLeft: index === 0 ? 0 : -8,
          }}
        >
          {initialsFor(member)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: '2px solid #0a0a1e',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(215,215,255,.8)', fontSize: 9.5, fontWeight: 700, marginLeft: -8,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}

const iconButtonStyle = {
  width: 40, height: 40, borderRadius: 14, background: tokens.glassStandardFill, border: `1px solid ${tokens.glassStandardBorder}`,
  color: tokens.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none',
} as const

/** Shared trip-workspace header: back, title/date, member avatars, share, overflow (opens More). */
export function TripMobileHeader({ variant, title, subtitle, readOnly, members, tripId, onBack, onOpenMore, backLabel = 'Back' }: TripMobileHeaderProps) {
  const [sharing, setSharing] = useState(false)

  const handleShare = async () => {
    if (sharing || typeof window === 'undefined') return
    setSharing(true)
    const url = `${window.location.origin}/trip/${tripId}/mobile`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        showToast('Trip link copied.', 'success')
      }
    } catch {
      // Share sheet dismissed by the user — not an error.
    } finally {
      setSharing(false)
    }
  }

  const overlay = variant === 'overlay'
  const textShadow = overlay ? '0 2px 12px rgba(0,0,0,.6)' : undefined

  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'auto', gap: 8 }}>
      <button onClick={onBack} title={backLabel} aria-label={backLabel} style={iconButtonStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      </button>

      <div style={{ flex: 1, textAlign: 'center', padding: '0 4px', minWidth: 0 }}>
        <div style={{ color: tokens.textPrimary, fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow }}>
          {title}
        </div>
        {subtitle && <div style={{ color: tokens.textSecondary, fontWeight: 500, fontSize: 12.5, marginTop: 3, textShadow }}>{subtitle}</div>}
        {readOnly && <div style={{ color: tokens.textMuted, fontWeight: 700, fontSize: 10, marginTop: 3, letterSpacing: '.07em', textTransform: 'uppercase', textShadow }}>Read only</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
        <AvatarStack members={members} />
        <button onClick={handleShare} disabled={sharing} title="Share trip" aria-label="Share trip" style={{ ...iconButtonStyle, width: 36, height: 36, opacity: sharing ? 0.6 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-3.9M8.6 13.5l6.8 3.9" /></svg>
        </button>
        <button onClick={onOpenMore} title="More options" aria-label="More options" style={{ ...iconButtonStyle, width: 36, height: 36 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
        </button>
      </div>
    </div>
  )

  if (overlay) {
    return (
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
          padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))',
          background: tokens.scrimTop,
          pointerEvents: 'none',
        }}
      >
        {content}
      </div>
    )
  }

  return (
    <header style={{ display: 'flex', flexDirection: 'column', padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))', flex: 'none' }}>
      {content}
    </header>
  )
}
