'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Home, Briefcase, Compass } from 'lucide-react'
import type { Profile } from '@/types'
import { getInitials } from '@/lib/utils'

// Single bottom nav shared by Dashboard, Trips, and Explore (previously three
// diverging copies, one of which shipped a dead "Itinerary" tab).

export type AppNavTab = 'home' | 'trips' | 'explore' | 'profile'

const AVATAR_GRAD = 'linear-gradient(135deg, #7c3aed, #4f46e5)'
const TAP = { type: 'spring' as const, stiffness: 420, damping: 22 }

const ITEMS = [
  { id: 'home' as const, Icon: Home, label: 'Home', href: '/dashboard' },
  { id: 'trips' as const, Icon: Briefcase, label: 'Trips', href: '/trips' },
  { id: 'explore' as const, Icon: Compass, label: 'Explore', href: '/explore' },
  { id: 'profile' as const, Icon: null, label: 'Profile', href: '/profile' },
]

export function AppBottomNav({ active, profile }: { active: AppNavTab; profile: Profile | null }) {
  const router = useRouter()
  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        width: 'auto', background: 'rgba(5,5,20,0.90)',
        borderTop: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)',
        display: 'flex', alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)', zIndex: 50,
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
              padding: '12px 4px 8px', background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
            }}
            whileTap={{ scale: 0.88 }}
            transition={TAP}
          >
            {id === 'profile' ? (
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: AVATAR_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', border: isActive ? '1.5px solid #f5a623' : 'none' }}>
                {getInitials(profile?.display_name ?? profile?.email)}
              </div>
            ) : Icon ? (
              <Icon style={{ width: 22, height: 22, color: isActive ? '#f5a623' : 'rgba(215,215,255,0.40)' }} />
            ) : null}
            <span style={{ fontSize: 10, fontWeight: 500, color: isActive ? '#f5a623' : 'rgba(215,215,255,0.40)' }}>
              {label}
            </span>
            {isActive && (
              <span style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#f5a623' }} />
            )}
          </motion.button>
        )
      })}
    </nav>
  )
}
