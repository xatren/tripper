'use client'

import type { CSSProperties, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DUSK, EASE_STANDARD, FONT_FRAUNCES, FONT_INTER,
  gradientText,
} from './tokens'

/* ─────────────────────────────────────────────────────────────────────
   Chrome that sits above the world: film grain, copy, controls and the
   roadside milestone reflectors that replace carousel dots.
───────────────────────────────────────────────────────────────────── */

/** Static 5% fractal noise. Rendered once — never regenerated per frame. */
export function FilmGrain() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 0.05, mixBlendMode: 'overlay', pointerEvents: 'none',
      }}
    >
      <filter id="duskGrain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#duskGrain)" />
    </svg>
  )
}

export function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

/* ── Title + body ─────────────────────────────────────────────────── */

export function AuthBrand({ reduced }: { reduced: boolean }) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 52 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.16 : 0.62, ease: EASE_STANDARD }}
      style={{
        position: 'absolute',
        top: 'clamp(132px, 24svh, 204px)',
        left: 0,
        right: 0,
        zIndex: 3,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -34,
          left: '50%',
          width: 330,
          height: 176,
          borderRadius: '50%',
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(ellipse at center, rgba(30,19,50,.68) 0%, rgba(16,11,36,.4) 48%, rgba(6,6,22,0) 76%)',
          filter: 'blur(7px)',
          zIndex: 0,
        }}
      />
      <svg
        width={31}
        height={39}
        viewBox="0 0 31 39"
        aria-hidden="true"
        focusable="false"
        style={{
          position: 'relative',
          zIndex: 1,
          overflow: 'visible',
          filter: 'drop-shadow(0 8px 15px rgba(245,166,35,.28))',
        }}
      >
        <defs>
          <linearGradient id="authBrandPin" x1="7" y1="2" x2="24" y2="37" gradientUnits="userSpaceOnUse">
            <stop stopColor={DUSK.amberLight} />
            <stop offset="0.56" stopColor={DUSK.amber} />
            <stop offset="1" stopColor={DUSK.amberDeep} />
          </linearGradient>
        </defs>
        <path
          d="M15.5 38C4.7 26.2 3.6 17.1 8.8 9.3 10.7 6.4 13 4 15.5 1.5 18 4 20.3 6.4 22.2 9.3 27.4 17.1 26.3 26.2 15.5 38Z"
          fill="url(#authBrandPin)"
        />
        <circle cx={15.5} cy={13.5} r={4.7} fill="#fffaf0" />
        <circle cx={15.5} cy={13.5} r={8.2} fill="none" stroke="rgba(255,255,255,.12)" />
      </svg>

      <h1
        style={{
          ...FONT_FRAUNCES,
          margin: '7px 0 0',
          fontSize: 'clamp(42px, 5.7svh, 48px)',
          lineHeight: 0.98,
          fontWeight: 650,
          letterSpacing: '-1.5px',
          backgroundImage:
            'linear-gradient(180deg, #fffdf7 0%, #ffe4b3 48%, #f5a623 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          textShadow: '0 10px 34px rgba(245,166,35,.18)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        Tripper
      </h1>

      <div
        style={{
          marginTop: 11,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(245,166,35,.62))',
          }}
        />
        <p
          style={{
            ...FONT_INTER,
            margin: 0,
            color: 'rgba(235,228,244,.78)',
            fontSize: 14,
            fontWeight: 450,
            letterSpacing: '.035em',
          }}
        >
          Plan road trips together
        </p>
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 1,
            background: 'linear-gradient(90deg, rgba(245,166,35,.62), transparent)',
          }}
        />
      </div>
    </motion.div>
  )
}

export interface JourneyCopyContent {
  /** Title split around its single accented word. */
  titleBefore: string
  accent: string
  titleAfter: string
  body: string
}

const TITLE_STYLE: CSSProperties = {
  ...FONT_FRAUNCES,
  fontSize: 'clamp(26px, 4.6vh, 34px)',
  lineHeight: 1.12,
  fontWeight: 600,
  letterSpacing: '-0.5px',
  color: DUSK.textPrimary,
  margin: 0,
  maxWidth: 360,
  textWrap: 'balance',
}

const BODY_STYLE: CSSProperties = {
  ...FONT_INTER,
  fontSize: 'clamp(14px, 2.3vh, 15px)',
  lineHeight: 'clamp(19px, 3.3vh, 22px)',
  color: DUSK.textSecondary,
  maxWidth: 320,
  margin: 'clamp(8px, 1.6vh, 12px) 0 0',
}

export function JourneyCopy({
  copyKey, content, direction, reduced,
}: {
  copyKey: string
  content: JourneyCopyContent
  /** +1 travelling forward, -1 travelling back. */
  direction: number
  reduced: boolean
}) {
  const shift = reduced ? 0 : 14 * direction
  return (
    <div
      style={{
        padding: '0 20px',
        height: 'clamp(132px, 17svh, 148px)',
        flexShrink: 0,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={copyKey}
          initial={{ opacity: 0, x: shift }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -shift }}
          transition={{
            duration: reduced ? 0.16 : 0.46,
            delay: reduced ? 0 : 0.42,
            ease: EASE_STANDARD,
          }}
        >
          <h1 style={TITLE_STYLE}>
            {content.titleBefore}
            <span style={gradientText}>{content.accent}</span>
            {content.titleAfter}
          </h1>
          <p style={BODY_STYLE}>{content.body}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ── Pressable ────────────────────────────────────────────────────── */

export function Press({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.div
      style={{ width: '100%', ...style }}
      whileTap={{ scale: 0.97, opacity: 0.85 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.div>
  )
}

/* ── Counter + Skip + CTA rail ────────────────────────────────────── */

export function JourneyCounter({ step, total }: { step: number; total: number }) {
  return (
    <span
      style={{
        ...FONT_INTER,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '.18em',
        textTransform: 'uppercase',
        color: DUSK.textMuted,
      }}
    >
      {String(step + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </span>
  )
}

export function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...FONT_INTER,
        background: 'none',
        border: 'none',
        color: DUSK.textMuted,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: 0,
      }}
    >
      Skip
    </button>
  )
}

export function JourneyBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Previous step"
      style={{
        ...FONT_INTER,
        background: 'none',
        border: 'none',
        color: DUSK.textMuted,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        minWidth: 64,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 5,
        padding: 0,
      }}
    >
      <span aria-hidden="true">←</span>
      Back
    </button>
  )
}

export function JourneyControls({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {children}
    </div>
  )
}
