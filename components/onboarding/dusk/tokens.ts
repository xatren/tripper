import type { CSSProperties } from 'react'

/* ─────────────────────────────────────────────────────────────────────
   TRIPPER — "DUSK EDITION" TOKENS
   Dark only. Reference frame 375 × 812.
   See docs/onboarding-dusk-journey-prompts.md for the authoring spec.
───────────────────────────────────────────────────────────────────── */

export const DUSK = {
  /* Ground gradient stops (top → bottom) */
  night:   '#060616',
  dusk:    '#0a0920',
  horizon: '#140f2c',
  ember:   '#241633',

  /* Surfaces */
  surface: '#12122b',
  raised:  '#20203f',

  /* Accent */
  amber:      '#f5a623',
  amberLight: '#ffc766',
  amberDeep:  '#e07b1e',

  /* Text */
  textPrimary:   '#ffffff',
  textSecondary: 'rgba(222,220,240,.76)',
  textMuted:     'rgba(222,220,240,.58)',

  /* Glass */
  glassFill:   'rgba(255,255,255,.055)',
  ghostFill:   'rgba(255,255,255,.035)',
  glassBorder: 'rgba(255,255,255,.13)',

  /* On-amber label */
  onAmber: '#1a0800',

  /* World fills */
  farRidge:   '#171233',
  midRidge:   '#1d1436',
  valley:     '#120e26',
  roadNear:   '#2a2440',
  roadFar:    '#1a1530',
  trees:      '#17112c',
  foreground: '#0d0a1c',

  /* Vehicle */
  bodyLight: '#f2a63a',
  bodyDark:  '#c9761f',
  tailLight: '#ff5a2e',
} as const

export const SUNSET_GRADIENT =
  `linear-gradient(120deg, ${DUSK.amberLight} 0%, ${DUSK.amber} 55%, ${DUSK.amberDeep} 100%)`

export const GROUND_GRADIENT =
  `linear-gradient(180deg, ${DUSK.night} 0%, ${DUSK.dusk} 34%, ${DUSK.horizon} 62%, ${DUSK.ember} 100%)`

export const EASE_STANDARD = [0.4, 0, 0.2, 1] as const
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const

export const FONT_INTER: CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
}

export const FONT_FRAUNCES: CSSProperties = {
  fontFamily: "var(--font-fraunces), 'Fraunces', 'Iowan Old Style', Georgia, serif",
}

/* ── Scene geometry (reference frame coordinates) ─────────────────── */
export const FRAME_H = 812
export const VP_X = 187          // vanishing point x
export const VP_Y = 452          // vanishing point y / horizon line

/* ── Motion budget ────────────────────────────────────────────────── */
export const STEP_DURATION = 0.88   // seconds — the standard transition
export const FINALE_DURATION = 1.25
export const INTRO_DURATION = 2.1

/** Per-step parallax travel, in reference px, per layer. */
export const PARALLAX = {
  farRidge: 2,
  midRidge: 6,
  fog: 4,
  valley: 14,
  road: 40,
  trees: 26,
  foreground: 90,
} as const

/* ── Shared surface recipes ───────────────────────────────────────── */
export const glassCard = (radius = 20): CSSProperties => ({
  background: DUSK.glassFill,
  border: `1px solid ${DUSK.glassBorder}`,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: radius,
})

export const pillPrimary: CSSProperties = {
  ...FONT_INTER,
  width: '100%',
  height: 54,
  borderRadius: 27,
  border: 'none',
  background: SUNSET_GRADIENT,
  boxShadow: '0 6px 22px rgba(245,166,35,.22)',
  color: DUSK.onAmber,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
}

export const pillGhost: CSSProperties = {
  ...FONT_INTER,
  width: '100%',
  height: 54,
  borderRadius: 27,
  background: DUSK.ghostFill,
  border: `1px solid ${DUSK.glassBorder}`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  color: DUSK.textPrimary,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
}

/** Sunset-gradient text fill — used on the single accented word. */
export const gradientText: CSSProperties = {
  backgroundImage: SUNSET_GRADIENT,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  fontStyle: 'italic',
}

export const ONBOARDING_STORAGE_KEY = 'tripper_onboarding_done'
