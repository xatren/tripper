'use client'

import { useState, useEffect, CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { MapPin, Map, Users, DollarSign } from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────────
   DESIGN TOKENS — exact color palette from spec
───────────────────────────────────────────────────────────────────── */
const C = {
  /* Backgrounds */
  screenBg:      'linear-gradient(145deg, #06061c, #0a1020, #071216)',
  canvasBg:      'linear-gradient(145deg, #05050f, #07101a, #050d0d)',

  /* Amber scale */
  amberBase:     '#f5a623',   // buttons, active dot, route pins, icon bg end
  amberLight:    '#f8c04a',   // button gradient start, icon gradient start
  amberDark:     '#e8821a',   // icon gradient end, inner pin circle
  amberMuted:    'rgba(210,165,80,.78)',  // "Misafir olarak devam et"

  /* Typography */
  white:         '#ffffff',   // headings
  offWhite:      'rgba(215,215,255,.88)', // Kayıt Ol button text
  lavender:      'rgba(210,210,255,.8)',  // pill labels
  graySubSplash: '#484868',   // "Road trip planner" subtitle
  graySubLand:   '#4a4a68',   // "Birlikte road trip planla"
  grayBody:      '#3e3e5c',   // onboarding description
  grayAtla:      '#363650',   // "Atla" skip button
  btnText:       '#0f0f1a',   // text on amber buttons

  /* Glass & Orbs */
  glassFill:     'rgba(255,255,255,.055)',
  glassBorder:   'rgba(255,255,255,.13)',
  orbAmber:      'rgba(245,140,0,.22)',
  orbPurple:     'rgba(90,0,210,.20)',
  orbTeal:       'rgba(0,100,160,.14)',
  glassInner:    'rgba(20,20,70,.18)',

  /* Route / Map */
  routePath:     '#8888e4',   // dashed SVG line
  routeMid:      '#7070d8',   // midpoint dot
  dotGrid:       'rgba(100,100,220,.28)', // dot grid inside card

  /* Progress */
  dotInactive:   '#1c1c34',
}

const FONT: CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
}

/* ── Helpers ───────────────────────────────────────────────────────── */
const glassCard = (radius = 20): CSSProperties => ({
  background: C.glassFill,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${C.glassBorder}`,
  borderRadius: radius,
})

/* ── Luminous orb ──────────────────────────────────────────────────── */
function Orb({ color, top, left, bottom, right, size = 360, cx }: {
  color: string; size?: number; cx?: boolean
  top?: string|number; left?: string|number; bottom?: string|number; right?: string|number
}) {
  return (
    <div style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%',
      top, left, bottom, right,
      transform: cx ? 'translateX(-50%)' : undefined,
      background: `radial-gradient(circle, ${color} 0%, transparent 68%)`,
      filter: 'blur(28px)', pointerEvents: 'none',
    }} />
  )
}

/* ── App icon ──────────────────────────────────────────────────────── */
function AppIcon({ size = 88 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.245),
      background: `linear-gradient(145deg, ${C.amberLight}, ${C.amberDark})`,
      boxShadow: `0 0 40px ${C.orbAmber}, 0 0 80px rgba(245,140,0,.10)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <MapPin size={size * 0.46} color={C.amberDark} strokeWidth={2.5} fill={C.white} />
    </div>
  )
}

/* ── Shared wrapper ────────────────────────────────────────────────── */
const WRAPPER: CSSProperties = {
  ...FONT, position: 'fixed', inset: 0, zIndex: 10,
  display: 'flex', flexDirection: 'column',
  background: C.screenBg, overflow: 'hidden',
}

/* ── Amber primary button ──────────────────────────────────────────── */
const BTN_PRIMARY: CSSProperties = {
  ...FONT, width: '100%', padding: '17px 24px',
  background: `linear-gradient(135deg, ${C.amberLight}, ${C.amberBase})`,
  boxShadow: `0 0 24px ${C.orbAmber}, 0 4px 16px rgba(245,140,0,.22)`,
  borderRadius: 14, border: 'none',
  color: C.btnText, fontSize: 17, fontWeight: 700,
  letterSpacing: '-0.01em', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

/* ── Pressable wrapper — scale + dim on tap ────────────────────────── */
function Press({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <motion.div
      style={{ width: '100%', ...style }}
      whileTap={{ scale: 0.96, opacity: 0.82 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.div>
  )
}

/* ── HomeBar ───────────────────────────────────────────────────────── */
function HomeBar() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 10, flexShrink: 0 }}>
      <div style={{ width: 134, height: 5, background: 'rgba(255,255,255,.18)', borderRadius: 3 }} />
    </div>
  )
}

/* ── Onboarding screens ────────────────────────────────────────────── */
const SCREENS = [
  { emoji: '🗺️', title: 'Draw your route',    subtitle: 'Set your route, add stops, and get ready for your adventure.' },
  { emoji: '📍', title: 'Plan every stop',  subtitle: 'Organize lodging, activities, and photos for each stop.' },
  { emoji: '👥', title: 'Plan with friends', subtitle: 'Share an invite code and edit together in real time.' },
  { emoji: '📍', title: 'Allow your location',  subtitle: 'We need your location to find nearby places and build your route.', isPermission: true as const },
] as const

const STORAGE_KEY = 'tripper_onboarding_done'

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export function MobileEntryFlow() {
  const [stage, setStage] = useState<'splash' | 'onboarding' | 'landing'>('splash')
  const [idx, setIdx]     = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      // DEV: her seferinde onboarding gösterir
      // PROD'a geçince: const done = localStorage.getItem(STORAGE_KEY); setStage(done ? 'landing' : 'onboarding')
      setStage('onboarding')
    }, 1500)
    return () => clearTimeout(t)
  }, [])

  const finish = () => { localStorage.setItem(STORAGE_KEY, '1'); setStage('landing') }
  const next   = () => idx < SCREENS.length - 1 ? setIdx(i => i + 1) : finish()
  const askGeo = () => {
    if ('geolocation' in navigator) navigator.geolocation.getCurrentPosition(next, next)
    else next()
  }

  const sc  = SCREENS[idx]
  const isP = 'isPermission' in sc && sc.isPermission

  return (
    <AnimatePresence mode="wait">

      {/* ═══════════════════════ SPLASH ══════════════════════════════ */}
      {stage === 'splash' && (
        <motion.div key="splash" style={WRAPPER}
          initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.4 }}>

          <Orb color={C.orbAmber}  top="-80px" left="50%" size={440} cx />
          <Orb color={C.orbPurple} bottom="-60px" left="-80px" size={300} />
          <Orb color={C.orbTeal}   top="55%" right="-70px" size={260} />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
            <motion.div
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}
            >
              <AppIcon size={96} />
              <div style={{ textAlign: 'center' }}>
                <h1 style={{ ...FONT, color: C.white, fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', margin: 0, lineHeight: 1 }}>
                  Tripper
                </h1>
                <p style={{ ...FONT, color: C.graySubSplash, fontSize: 14, fontWeight: 400, marginTop: 8, letterSpacing: '-0.01em' }}>
                  Road trip planner
                </p>
              </div>
            </motion.div>
          </div>
          <HomeBar />
        </motion.div>
      )}

      {/* ══════════════════════ ONBOARDING ═══════════════════════════ */}
      {stage === 'onboarding' && (
        <motion.div key="onboarding" style={WRAPPER}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}>

          <Orb color={C.orbAmber}  top="-80px" left="50%" size={440} cx />
          <Orb color={C.orbPurple} bottom="-60px" left="-80px" size={300} />
          <Orb color={C.orbTeal}   top="55%" right="-70px" size={240} />

          {/* Skip */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'flex-end', padding: '52px 24px 0' }}>
            <button onClick={finish} style={{ ...FONT, background: 'none', border: 'none', color: C.grayAtla, fontSize: 14, fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.01em' }}>
              Skip
            </button>
          </div>

          {/* Slide */}
          <AnimatePresence mode="wait">
            <motion.div key={idx}
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.26, ease: 'easeInOut' }}
              style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 26px 0', gap: 28 }}
            >
              {/* Illustration card */}
              <div style={{
                width: '100%', maxWidth: 312, height: 208,
                borderRadius: 20, position: 'relative', overflow: 'hidden',
                /* layered bg: glass tint + dot grid */
                background: `${C.glassInner}`,
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${C.glassBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Dot grid overlay */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 20,
                  backgroundImage: `radial-gradient(circle, ${C.dotGrid} 1px, transparent 1px)`,
                  backgroundSize: '22px 22px',
                }} />
                {/* Route SVG */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 312 208" fill="none">
                  {/* dashed path */}
                  <path d="M 42 170 C 88 138 158 92 178 68 Q 218 42 274 34"
                    stroke={C.routePath} strokeWidth="1.8" strokeDasharray="6 5" strokeLinecap="round" />
                  {/* start pin */}
                  <circle cx="42" cy="170" r="6"  fill={C.amberBase} />
                  <circle cx="42" cy="170" r="11" stroke={C.amberBase} strokeWidth="1.4" fill="none" opacity=".35" />
                  {/* midpoint */}
                  <circle cx="178" cy="68" r="4" fill={C.routeMid} />
                  {/* end pin */}
                  <circle cx="274" cy="34" r="6"  fill={C.amberBase} />
                  <circle cx="274" cy="34" r="11" stroke={C.amberBase} strokeWidth="1.4" fill="none" opacity=".35" />
                </svg>
                {/* Emoji */}
                <span style={{ fontSize: 74, lineHeight: 1, userSelect: 'none', position: 'relative', zIndex: 1 }}>
                  {sc.emoji}
                </span>
              </div>

              {/* Text */}
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ ...FONT, color: C.white, fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.2 }}>
                  {sc.title}
                </h2>
                <p style={{ ...FONT, color: C.grayBody, fontSize: 14, fontWeight: 400, lineHeight: 1.65, margin: '0 auto', maxWidth: 272 }}>
                  {sc.subtitle}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Dots + CTA */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 24px 44px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {SCREENS.map((_, i) => (
                <motion.div key={i}
                  animate={{ width: i === idx ? 28 : 8 }}
                  transition={{ duration: 0.22 }}
                  style={{
                    height: 8, borderRadius: 4,
                    background: i === idx ? `linear-gradient(90deg, ${C.amberLight}, ${C.amberBase})` : C.dotInactive,
                    boxShadow: i === idx ? `0 0 10px ${C.orbAmber}` : 'none',
                  }}
                />
              ))}
            </div>

            {isP ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Press><button onClick={askGeo} style={{ ...BTN_PRIMARY, width: '100%' }}>📍 Allow Location</button></Press>
                <Press style={{ width: 'auto' }}>
                  <button onClick={next} style={{ ...FONT, background: 'none', border: 'none', color: C.grayAtla, fontSize: 13, cursor: 'pointer', paddingTop: 4, width: '100%' }}>
                    Not now
                  </button>
                </Press>
              </div>
            ) : (
              <Press><button onClick={next} style={{ ...BTN_PRIMARY, width: '100%' }}>Continue →</button></Press>
            )}
          </div>
          <HomeBar />
        </motion.div>
      )}

      {/* ════════════════════════ LANDING ════════════════════════════ */}
      {stage === 'landing' && (
        <motion.div key="landing" style={WRAPPER}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}>

          <Orb color={C.orbAmber}  top="-60px" left="50%" size={460} cx />
          <Orb color={C.orbPurple} bottom="-60px" left="-80px" size={320} />
          <Orb color={C.orbTeal}   top="48%" right="-70px" size={260} />

          {/* Hero — no glass card, content floats on bg */}
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.45, ease: 'easeOut' }}
            style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', gap: 16 }}
          >
            <AppIcon size={88} />

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <h1 style={{ ...FONT, color: C.white, fontSize: 38, fontWeight: 800, letterSpacing: '-1.5px', margin: 0, lineHeight: 1 }}>
                Tripper
              </h1>
              <p style={{ ...FONT, color: C.graySubLand, fontSize: 14, fontWeight: 400, margin: 0, letterSpacing: '-0.01em' }}>
                Plan road trips together
              </p>
            </div>

            {/* Badge pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
              {[
                { icon: Map,        label: 'Map'        },
                { icon: Users,      label: 'Collaborate' },
                { icon: DollarSign, label: 'Budget'      },
                { icon: MapPin,     label: 'Stops'       },
              ].map(({ icon: Icon, label }) => (
                <span key={label} style={{
                  ...FONT,
                  ...glassCard(50),
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 13px',
                  color: C.lavender,
                  fontSize: 12, fontWeight: 500,
                }}>
                  <Icon size={12} strokeWidth={2} />
                  {label}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Buttons */}
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.42, ease: 'easeOut' }}
            style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 11, padding: '16px 24px 44px' }}
          >
            <Press>
              <Link href="/login" style={{ textDecoration: 'none' }}>
                <button style={{ ...BTN_PRIMARY, width: '100%' }}>Log In</button>
              </Link>
            </Press>

            <Press>
              <Link href="/sign-up" style={{ textDecoration: 'none' }}>
                <div style={{
                  ...FONT, ...glassCard(14),
                  padding: '17px 24px', textAlign: 'center',
                  color: C.offWhite, fontSize: 17, fontWeight: 700,
                  letterSpacing: '-0.01em', cursor: 'pointer',
                }}>
                  Sign Up
                </div>
              </Link>
            </Press>

            <Press>
              <Link href="/sign-up?guest=true" style={{
                ...FONT, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px', color: C.amberMuted,
                fontSize: 13, fontWeight: 500, textDecoration: 'none', letterSpacing: '-0.01em',
              }}>
                Continue as guest →
              </Link>
            </Press>
          </motion.div>

          <HomeBar />
        </motion.div>
      )}

    </AnimatePresence>
  )
}
