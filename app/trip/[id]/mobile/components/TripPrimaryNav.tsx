'use client'

import type { ReactNode } from 'react'
import { tokens } from '@/components/mobile'
import { ACCENT, type Section } from '../domain-ui'
import { DUSK } from '@/components/design/tokens'

export type PrimaryNavSection = Exclude<Section, 'more'>

export interface TripPrimaryNavProps {
  active: Section
  onSelect: (section: PrimaryNavSection) => void
  onOpenMore: () => void
  onPrefetch?: (section: PrimaryNavSection) => void
}

const ITEMS: { key: Section; label: string; icon: (color: string) => ReactNode }[] = [
  {
    key: 'overview', label: 'Overview',
    icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5" /><path d="M5.5 9v10.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9" /><path d="M9.5 20.5v-6h5v6" /></svg>),
  },
  {
    key: 'plan', label: 'Plan',
    icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>),
  },
  {
    key: 'explore', label: 'Explore',
    icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 6-6 2 2-6 6-2z" /></svg>),
  },
  {
    key: 'bookings', label: 'Bookings',
    icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v14" strokeDasharray="2 2" /></svg>),
  },
  {
    key: 'more', label: 'More',
    icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.6" fill={color} /><circle cx="12" cy="12" r="1.6" fill={color} /><circle cx="19" cy="12" r="1.6" fill={color} /></svg>),
  },
]

/** Trip workspace's primary nav bar — Plan / Explore / Bookings / More. */
export function TripPrimaryNav({ active, onSelect, onOpenMore, onPrefetch }: TripPrimaryNavProps) {
  return (
    // Tighter gap and side padding than the other bars: five 12px labels have to
    // fit a 320px viewport without shrinking the type back below the legible floor.
    <nav
      aria-label="Trip sections"
      style={{ display: 'flex', gap: 3, borderTop: `1px solid ${tokens.glassStandardBorder}`, background: tokens.glassSubtleFill, backdropFilter: 'blur(var(--glass-standard-blur))', WebkitBackdropFilter: 'blur(var(--glass-standard-blur))', padding: '10px 8px 12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', flex: 'none' }}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active
        const color = isActive ? ACCENT : DUSK.textMuted
        const handleActivate = () => {
          if (item.key === 'more') onOpenMore()
          else onSelect(item.key)
        }
        const handlePrefetch = () => {
          if (item.key !== 'more') onPrefetch?.(item.key)
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={handleActivate}
            onPointerEnter={handlePrefetch}
            onFocus={handlePrefetch}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              minHeight: 48, padding: '7px 0 6px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: isActive ? 'rgba(245,166,35,.12)' : 'transparent',
            }}
          >
            {item.icon(color)}
            <span style={{ color, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
