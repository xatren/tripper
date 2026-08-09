'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { type Section } from '../domain-ui'
import { DUSK } from '@/components/design/tokens'

// Same floating-pill language as AppBottomNav (Dashboard/Trips/Explore/Profile)
// so the bottom nav reads as one system across the app.
const TAP = { type: 'spring' as const, stiffness: 420, damping: 22 }

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
    icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polygon points="15.5 8.5 13.2 13.2 8.5 15.5 10.8 10.8 15.5 8.5" strokeLinejoin="round" /></svg>),
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

/** Trip workspace's primary nav bar — Overview / Plan / Explore / Bookings / More. */
export function TripPrimaryNav({ active, onSelect, onOpenMore, onPrefetch }: TripPrimaryNavProps) {
  return (
    <nav
      aria-label="Trip sections"
      style={{
        display: 'flex', alignItems: 'stretch',
        margin: '0 16px max(10px, env(safe-area-inset-bottom))',
        background: 'rgba(8,8,25,0.90)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20,
        boxShadow: '0 12px 34px rgba(0,0,0,.42)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        padding: '3px 6px', flex: 'none',
        fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active
        const color = isActive ? DUSK.amber : 'rgba(222,220,240,.58)'
        const handleActivate = () => {
          if (item.key === 'more') onOpenMore()
          else onSelect(item.key)
        }
        const handlePrefetch = () => {
          if (item.key !== 'more') onPrefetch?.(item.key)
        }
        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={handleActivate}
            onPointerEnter={handlePrefetch}
            onFocus={handlePrefetch}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              minHeight: 54, padding: '6px 4px 5px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', position: 'relative',
            }}
            whileTap={{ scale: 0.88 }}
            transition={TAP}
          >
            {item.icon(color)}
            <span style={{ color, fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap' }}>{item.label}</span>
          </motion.button>
        )
      })}
    </nav>
  )
}
