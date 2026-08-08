'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Map as MapIcon, Briefcase, Compass } from 'lucide-react'
import type { Profile } from '@/types'
import { getInitials } from '@/lib/utils'
import { DUSK } from '@/components/design/tokens'

// Single bottom nav shared by Dashboard, Trips, and Explore (previously three
// diverging copies, one of which shipped a dead "Itinerary" tab).

export type AppNavTab = 'home' | 'trips' | 'explore' | 'profile'

const AVATAR_GRAD = 'linear-gradient(135deg, #7c3aed, #4f46e5)'
const TAP = { type: 'spring' as const, stiffness: 420, damping: 22 }

const ITEMS = [
  { id: 'home' as const, Icon: MapIcon, label: 'Map', href: '/dashboard' },
  { id: 'trips' as const, Icon: Briefcase, label: 'Trips', href: '/trips' },
  { id: 'explore' as const, Icon: Compass, label: 'Discover', href: '/explore' },
  { id: 'profile' as const, Icon: null, label: 'Profile', href: '/profile' },
]

export function AppBottomNav({ active, profile, floating = false }: { active: AppNavTab; profile: Profile | null; floating?: boolean }) {
  const router = useRouter()
  return (
    <nav
      style={{
        position: 'fixed', bottom: floating ? 'max(10px, env(safe-area-inset-bottom))' : 0,
        left: floating ? 16 : 0, right: floating ? 16 : 0,
        width: floating ? 'min(calc(100% - 32px), 512px)' : 'auto',
        margin: floating ? '0 auto' : undefined,
        background: floating ? 'rgba(8,8,25,0.90)' : 'rgba(5,5,20,0.90)',
        border: floating ? '1px solid rgba(255,255,255,0.14)' : undefined,
        borderTop: floating ? undefined : '1px solid rgba(255,255,255,0.08)',
        borderRadius: floating ? 20 : undefined,
        boxShadow: floating ? '0 12px 34px rgba(0,0,0,.42)' : undefined,
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'stretch',
        padding: floating ? '3px 6px' : undefined,
        paddingBottom: floating ? 3 : 'env(safe-area-inset-bottom, 16px)', zIndex: 50,
        fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
      {ITEMS.map(({ id, Icon, label, href }) => {
        const isActive = id === active
        return (
          <motion.button
            key={id}
            onClick={() => { if (!isActive) router.push(href) }}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              minHeight: 54, padding: floating ? '6px 4px 5px' : '12px 4px 8px', background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
            }}
            whileTap={{ scale: 0.88 }}
            transition={TAP}
          >
            {id === 'profile' ? (
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: AVATAR_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: DUSK.textPrimary, border: isActive ? '1.5px solid #f5a623' : 'none' }}>
                {getInitials(profile?.display_name ?? profile?.email)}
              </div>
            ) : Icon ? (
              <Icon style={{ width: 22, height: 22, color: isActive ? '#f5a623' : DUSK.textMuted }} />
            ) : null}
            <span style={{ fontSize: floating ? 11.5 : 10, fontWeight: 600, color: isActive ? '#f5a623' : floating ? 'rgba(222,220,240,.58)' : DUSK.textMuted }}>
              {label}
            </span>
            {isActive && (
              <span style={{ position: 'absolute', bottom: floating ? 1 : 5, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#f5a623' }} />
            )}
          </motion.button>
        )
      })}
    </nav>
  )
}
