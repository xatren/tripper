'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { JourneyScene } from '@/components/onboarding/dusk/JourneyScene'
import { FilmGrain } from '@/components/onboarding/dusk/JourneyChrome'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'
import {
  DUSK, EASE_STANDARD, FONT_FRAUNCES, FONT_INTER, GROUND_GRADIENT, gradientText,
} from '@/components/onboarding/dusk/tokens'

/* ─────────────────────────────────────────────────────────────────────
   DuskAuthShell — the calmed continuation of the finale landscape.
   Same world, further along, completely at rest: no parallax, no loops.
   Auth logic stays in the pages; this file is presentation only.
───────────────────────────────────────────────────────────────────── */

const TITLES = {
  login: { before: 'Welcome ', accent: 'back', after: '.', subtitle: 'Sign in to pick your trip back up.' },
  'sign-up': { before: 'Start something ', accent: 'new', after: '.', subtitle: 'Create an account and map the first route.' },
} as const

const ROOT: CSSProperties = {
  ...FONT_INTER,
  position: 'relative',
  minHeight: '100dvh',
  background: GROUND_GRADIENT,
  display: 'flex',
  flexDirection: 'column',
  overflowX: 'hidden',
}

const SCRIM: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background:
    'linear-gradient(180deg, rgba(6,6,22,.12) 0%, rgba(6,6,22,.42) 20%, rgba(6,6,22,.62) 37%, rgba(6,6,22,.82) 100%)',
}

export function DuskAuthShell({
  variant,
  children,
}: {
  variant: 'login' | 'sign-up'
  children: ReactNode
}) {
  const reduced = useReducedMotionPreference()
  const copy = TITLES[variant]

  return (
    <div style={ROOT}>
      {/* Settled world — frozen on purpose: the scene never animates here.
          Locked to the same 375-wide column as the content below, so the
          background stays aligned with it at any browser window width. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden',
          display: 'flex', justifyContent: 'center',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 480, height: '100%' }}>
          <JourneyScene stage="auth" step={3} reduced intro={false} showPin={false} vehicleY={700} />
          <div style={SCRIM} />
          <FilmGrain />
        </div>
      </div>

      {/* Back */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'calc(clamp(16px, 7vh, 56px) + env(safe-area-inset-top)) 20px 0',
        }}
      >
        <Link
          href="/"
          aria-label="Back"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, color: DUSK.textSecondary, textDecoration: 'none',
          }}
        >
          <ArrowLeft size={24} />
        </Link>
      </div>

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          padding: '24px 24px calc(40px + env(safe-area-inset-bottom))',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.16 : 0.4, ease: EASE_STANDARD }}
          style={{ width: '100%', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          <div>
            <h1
              style={{
                ...FONT_FRAUNCES,
                fontSize: 30,
                lineHeight: '34px',
                fontWeight: 600,
                letterSpacing: '-0.5px',
                color: DUSK.textPrimary,
                margin: 0,
              }}
            >
              {copy.before}
              <span style={gradientText}>{copy.accent}</span>
              {copy.after}
            </h1>
            <p style={{ ...FONT_INTER, fontSize: 15, lineHeight: '22px', color: DUSK.textSecondary, margin: '8px 0 0' }}>
              {copy.subtitle}
            </p>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  )
}
