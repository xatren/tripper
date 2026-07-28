'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { getSafeRedirectPath } from '@/lib/safe-redirect'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'
import { JourneyScene } from './dusk/JourneyScene'
import {
  AuthBrand, FilmGrain, GoogleGlyph, JourneyBackButton, JourneyControls, JourneyCopy, JourneyCounter,
  Press, SkipButton, type JourneyCopyContent,
} from './dusk/JourneyChrome'
import {
  DUSK, EASE_STANDARD, FINALE_DURATION, FONT_INTER,
  GROUND_GRADIENT, INTRO_DURATION, ONBOARDING_STORAGE_KEY,
  pillGhost, pillPrimary,
} from './dusk/tokens'

/* ─────────────────────────────────────────────────────────────────────
   MobileEntryFlow — Tripper "Dusk Journey" onboarding.

   One continuous 2.5D landscape. Four journey steps move the camera
   down a single mountain route, a location beat parks at a viewpoint,
   then a cinematic finale hands off to the auth choice — all without
   the scene ever unmounting or going to black.

   Authoring spec: docs/onboarding-dusk-journey-prompts.md
───────────────────────────────────────────────────────────────────── */

type Stage = 'journey' | 'permission' | 'finale' | 'auth'

const JOURNEY_COPY: JourneyCopyContent[] = [
  {
    titleBefore: 'The road is ', accent: 'calling.', titleAfter: '',
    body: 'Plan your route, stops, crew, and budget—all in one place.',
  },
  {
    titleBefore: 'Map the ', accent: 'road', titleAfter: ' ahead.',
    body: 'Build your route, add stops, and drag to reorder the trip.',
  },
  {
    titleBefore: 'Turn every stop into a ', accent: 'story.', titleAfter: '',
    body: 'Keep stays, plans, and photos attached to the stop where they belong.',
  },
  {
    titleBefore: 'The best roads are ', accent: 'shared.', titleAfter: '',
    body: 'Invite your crew once and plan the same trip together, live.',
  },
]

const PERMISSION_COPY: JourneyCopyContent = {
  titleBefore: "Find what's ", accent: 'nearby.', titleAfter: '',
  body: 'Use your location to surface fuel, food, views, and stays along the way.',
}

const JOURNEY_CTA = ['Start the journey', 'Continue', 'Continue', 'Continue'] as const
const LAST_STEP = JOURNEY_COPY.length - 1
const TOTAL_BEATS = JOURNEY_COPY.length

const ROOT: CSSProperties = {
  ...FONT_INTER,
  position: 'fixed',
  inset: 0,
  zIndex: 10,
  background: GROUND_GRADIENT,
  overflow: 'hidden',
}

const COLUMN: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: '100%',
  maxWidth: 480,
  height: '100%',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
}

export function MobileEntryFlow() {
  const reduced = useReducedMotionPreference()

  const [stage, setStage] = useState<Stage>('journey')
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [intro, setIntro] = useState(true)
  const [chromeReady, setChromeReady] = useState(false)
  const [requestingGeo, setRequestingGeo] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [compactViewport, setCompactViewport] = useState(false)
  const geoResolved = useRef(false)

  useEffect(() => {
    const query = window.matchMedia('(max-height: 640px)')
    const sync = () => setCompactViewport(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  /* A returning user lands straight on the settled auth scene. */
  useEffect(() => {
    const done = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (done) {
      setStage('auth')
      setIntro(false)
      setChromeReady(true)
      return
    }
    if (reduced) {
      setIntro(false)
      setChromeReady(true)
      return
    }
    const chrome = setTimeout(() => setChromeReady(true), 1700)
    const beat = setTimeout(() => setIntro(false), INTRO_DURATION * 1000)
    return () => { clearTimeout(chrome); clearTimeout(beat) }
  }, [reduced])

  /* The finale plays once, then the auth layer settles over the world. */
  useEffect(() => {
    if (stage !== 'finale') return
    const t = setTimeout(() => setStage('auth'), reduced ? 200 : FINALE_DURATION * 1000)
    return () => clearTimeout(t)
  }, [stage, reduced])

  const enterFinale = useCallback(() => {
    geoResolved.current = true
    setRequestingGeo(false)
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    setDirection(1)
    setStage('finale')
  }, [])

  const goNext = useCallback(() => {
    if (stage !== 'journey') return
    setDirection(1)
    if (step < LAST_STEP) setStep(s => s + 1)
    else setStage('permission')
  }, [stage, step])

  const goBack = useCallback(() => {
    setDirection(-1)
    if (stage === 'permission') { setStage('journey'); setStep(LAST_STEP); return }
    if (stage === 'journey' && step > 0) setStep(s => s - 1)
  }, [stage, step])

  /* Location is requested ONLY by the CTA — never on mount or on swipe. */
  const allowLocation = useCallback(() => {
    if (requestingGeo) return
    geoResolved.current = false
    const fallbackTimer: { id?: number } = {}
    const settle = () => {
      if (geoResolved.current) return
      geoResolved.current = true
      if (fallbackTimer.id !== undefined) window.clearTimeout(fallbackTimer.id)
      setRequestingGeo(false)
      enterFinale()
    }
    if (!('geolocation' in navigator)) {
      settle()
      return
    }
    setRequestingGeo(true)
    fallbackTimer.id = window.setTimeout(settle, 9000)
    try {
      navigator.geolocation.getCurrentPosition(
        settle,
        settle,
        { timeout: 8000, maximumAge: 300000 },
      )
    } catch {
      settle()
    }
  }, [requestingGeo, enterFinale])

  const handleGoogle = useCallback(async () => {
    setGoogleLoading(true)
    setAuthError(null)
    try {
      const rawNext = new URLSearchParams(window.location.search).get('next')
      const safeNext = getSafeRedirectPath(rawNext, window.location.origin)
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('next', safeNext)
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      })
      if (error) {
        setAuthError(error.message || 'Google sign-in could not be started. Please try again.')
        setGoogleLoading(false)
      }
    } catch {
      setAuthError('Google sign-in could not be started. Check your connection and try again.')
      setGoogleLoading(false)
    }
  }, [])

  const swipeEnabled = stage === 'journey' || stage === 'permission'
  /* Pan rather than drag: `drag` captures the pointer and eats taps on the CTA. */
  const onPanEnd = (_e: unknown, info: PanInfo) => {
    if (!swipeEnabled) return
    if (Math.abs(info.offset.x) < 60 || Math.abs(info.offset.y) > Math.abs(info.offset.x)) return
    if (info.offset.x < 0) goNext()
    else goBack()
  }

  const inJourney = stage === 'journey'
  const inPermission = stage === 'permission'
  const inAuth = stage === 'auth'
  const showJourneyChrome = (inJourney || inPermission) && chromeReady

  return (
    <div
      style={{
        ...ROOT,
        overflowY: inAuth ? 'auto' : 'hidden',
        WebkitOverflowScrolling: inAuth ? 'touch' : undefined,
      }}
    >
      {process.env.NODE_ENV === 'development' && (
        <button
          type="button"
          onClick={() => {
            window.localStorage.removeItem(ONBOARDING_STORAGE_KEY)
            window.location.reload()
          }}
          style={{
            ...FONT_INTER,
            position: 'fixed', top: 'calc(58px + env(safe-area-inset-top))', left: 8, zIndex: 50,
            width: 116, height: 44, padding: 0,
            background: 'none', border: 'none', color: 'rgba(255,255,255,.52)',
            fontSize: 9, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
          }}
        >
          <span
            style={{
              padding: '3px 7px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(0,0,0,.34)',
            }}
          >
            ↺ Restart onboarding
          </span>
        </button>
      )}
      {/* The world stays locked to the same 375-wide column as the content
          below, so the background scene aligns with it at any window width. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 480, height: '100%' }}>
          <JourneyScene
            stage={inJourney && intro ? 'intro' : stage}
            step={step}
            reduced={reduced}
            intro={intro}
            compact={compactViewport}
            showPin={!inAuth}
          />
          {/* Keeps the copy legible over the world without hiding it. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: inAuth
                ? 'linear-gradient(180deg, rgba(6,6,22,0) 48%, rgba(6,6,22,.12) 58%, rgba(6,6,22,.76) 78%, rgba(6,6,22,.98) 100%)'
                : 'linear-gradient(180deg, rgba(6,6,22,0) 52%, rgba(6,6,22,.52) 70%, rgba(6,6,22,.88) 100%)',
            }}
          />
          <FilmGrain />
        </div>
      </div>

      <motion.div
        style={{
          ...COLUMN,
          height: inAuth ? 'auto' : '100%',
          minHeight: '100%',
        }}
        onPanEnd={swipeEnabled ? onPanEnd : undefined}
      >
        <AnimatePresence mode="wait">
          {showJourneyChrome && (
            <motion.div
              key="journey-chrome"
              style={{ display: 'contents' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.16 : 0.3, ease: EASE_STANDARD }}
            >
              <header
                style={{
                  height: 'calc(56px + env(safe-area-inset-top))',
                  padding: 'env(safe-area-inset-top) 24px 0',
                  display: 'flex', position: 'relative',
                  alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0,
                }}
              >
                {inPermission || step > 0
                  ? <JourneyBackButton onClick={goBack} />
                  : <span aria-hidden="true" style={{ width: 64 }} />}
                {!inPermission && (
                  <span style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)' }}>
                    <JourneyCounter step={step} total={TOTAL_BEATS} />
                  </span>
                )}
                <SkipButton onClick={enterFinale} />
              </header>

              <div style={{ flex: 1 }} />

              <JourneyCopy
                copyKey={inPermission ? 'permission' : `step-${step}`}
                content={inPermission ? PERMISSION_COPY : JOURNEY_COPY[step]}
                direction={direction}
                reduced={reduced}
              />

              <div style={{ height: 'clamp(8px, 3vh, 24px)', flexShrink: 0 }} />

              <JourneyControls>
                {inPermission ? (
                  <>
                    <Press>
                      <button
                        type="button"
                        onClick={allowLocation}
                        disabled={requestingGeo}
                        style={{ ...pillPrimary, opacity: requestingGeo ? 0.7 : 1 }}
                      >
                        {requestingGeo ? 'Requesting…' : 'Allow Location'}
                      </button>
                    </Press>
                    <button
                      type="button"
                      onClick={enterFinale}
                      style={{
                        ...FONT_INTER, background: 'none', border: 'none', cursor: 'pointer',
                        color: DUSK.textSecondary, fontSize: 14, fontWeight: 500, height: 44,
                      }}
                    >
                      Not now
                    </button>
                  </>
                ) : (
                  <Press>
                    <button type="button" onClick={goNext} style={pillPrimary}>
                      {JOURNEY_CTA[step]}
                    </button>
                  </Press>
                )}
              </JourneyControls>

              <div style={{ height: 'calc(20px + env(safe-area-inset-bottom))', flexShrink: 0 }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Auth choice — the visual finale of the onboarding ──── */}
        {inAuth && (
          <div style={{ display: 'contents' }}>
            <AuthBrand reduced={reduced} />
            <div style={{ flex: 1 }} />

            <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {authError && (
                <p
                  role="alert"
                  style={{
                    ...FONT_INTER,
                    color: '#ffb08f',
                    fontSize: 13,
                    lineHeight: '18px',
                    textAlign: 'center',
                    margin: 0,
                  }}
                >
                  {authError}
                </p>
              )}
              {[
                <Link key="login" href="/login" style={{ textDecoration: 'none', display: 'block' }}>
                  <span style={{ ...pillPrimary, display: 'flex' }}>Log In</span>
                </Link>,
                <Link key="signup" href="/sign-up" style={{ textDecoration: 'none', display: 'block' }}>
                  <span style={{ ...pillGhost, display: 'flex' }}>Sign Up</span>
                </Link>,
                <button
                  key="google"
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading}
                  style={{ ...pillGhost, opacity: googleLoading ? 0.6 : 1 }}
                >
                  <GoogleGlyph />
                  {googleLoading ? 'Signing in…' : 'Continue with Google'}
                </button>,
              ].map((node, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0.16 : 0.4, delay: reduced ? 0 : 0.1 + i * 0.09, ease: EASE_STANDARD }}
                >
                  <Press>{node}</Press>
                </motion.div>
              ))}
            </div>

            <div style={{ height: 'calc(28px + env(safe-area-inset-bottom))', flexShrink: 0 }} />
          </div>
        )}
      </motion.div>
    </div>
  )
}
