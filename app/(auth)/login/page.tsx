'use client'

import { useState, CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { MapPin, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSafeRedirectPath } from '@/lib/safe-redirect'

/* ── Design tokens ─────────────────────────────────────────────────── */
const C = {
  screenBg:    'linear-gradient(145deg, #06061c, #0a1020, #071216)',
  amberBase:   '#f5a623',
  amberLight:  '#f8c04a',
  amberMuted:  'rgba(210,165,80,.78)',
  white:       '#ffffff',
  offWhite:    'rgba(215,215,255,.88)',
  graySubLand: '#4a4a68',
  grayBody:    '#3e3e5c',
  grayAtla:    '#363650',
  btnText:     '#0f0f1a',
  glassFill:   'rgba(255,255,255,.055)',
  glassBorder: 'rgba(255,255,255,.13)',
  orbAmber:    'rgba(245,140,0,.22)',
  orbPurple:   'rgba(90,0,210,.20)',
  orbTeal:     'rgba(0,100,160,.14)',
}

const FONT: CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
}

const BTN_PRIMARY: CSSProperties = {
  ...FONT, width: '100%', padding: '17px 24px',
  background: `linear-gradient(135deg, ${C.amberLight}, ${C.amberBase})`,
  boxShadow: `0 0 24px ${C.orbAmber}, 0 4px 16px rgba(245,140,0,.22)`,
  borderRadius: 14, border: 'none',
  color: C.btnText, fontSize: 17, fontWeight: 700,
  letterSpacing: '-0.01em', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}

const BTN_GLASS: CSSProperties = {
  ...FONT, width: '100%', padding: '16px 24px',
  background: 'rgba(255,255,255,.055)',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 14, cursor: 'pointer',
  color: C.offWhite, fontSize: 15, fontWeight: 600,
  letterSpacing: '-0.01em',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
}

/* ── Orb ───────────────────────────────────────────────────────────── */
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

/* ── Press wrapper ─────────────────────────────────────────────────── */
function Press({ children }: { children: React.ReactNode }) {
  return (
    <motion.div style={{ width: '100%' }}
      whileTap={{ scale: 0.96, opacity: 0.82 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
      {children}
    </motion.div>
  )
}

/* ── App icon (small) ──────────────────────────────────────────────── */
function SmallIcon() {
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
      background: `linear-gradient(145deg, #f8c04a, #e8821a)`,
      boxShadow: `0 0 28px ${C.orbAmber}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <MapPin size={24} color="#e8821a" strokeWidth={2.5} fill="#ffffff" />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════ */
export default function LoginPage() {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPass, setShowPass]         = useState(false)
  const [loading, setLoading]           = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else {
      const rawNext = new URLSearchParams(window.location.search).get('next')
      router.push(getSafeRedirectPath(rawNext, window.location.origin))
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true); setError(null)
    const rawNext = new URLSearchParams(window.location.search).get('next')
    const safeNext = getSafeRedirectPath(rawNext, window.location.origin)
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', safeNext)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  return (
    <div style={{ ...FONT, minHeight: '100dvh', background: C.screenBg, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Orbs */}
      <Orb color={C.orbAmber}  top="-80px" left="50%" size={440} cx />
      <Orb color={C.orbPurple} bottom="-60px" left="-80px" size={300} />
      <Orb color={C.orbTeal}   top="50%" right="-70px" size={260} />

      {/* Back */}
      <div style={{ position: 'relative', zIndex: 1, padding: '52px 20px 0' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.grayAtla, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 24px 40px' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ width: '100%', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SmallIcon />
            <div>
              <h1 style={{ color: C.white, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.1 }}>
                Welcome back
              </h1>
              <p style={{ color: C.graySubLand, fontSize: 13, fontWeight: 400, margin: '4px 0 0' }}>
                Sign in to continue your adventure
              </p>
            </div>
          </div>

          {/* Glass card */}
          <div style={{ background: C.glassFill, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${C.glassBorder}`, borderRadius: 20, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Google */}
            <Press>
              <button onClick={handleGoogle} disabled={googleLoading} style={BTN_GLASS}>
                {googleLoading
                  ? <Spinner />
                  : <GoogleIcon />}
                {googleLoading ? 'Signing in...' : 'Continue with Google'}
              </button>
            </Press>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: C.glassBorder }} />
              <span style={{ color: C.grayAtla, fontSize: 12, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.glassBorder }} />
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="login-email" style={{ color: C.offWhite, fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>
                  Email
                </label>
                <input
                  id="login-email"
                  className="auth-input"
                  type="email" placeholder="you@example.com"
                  required autoComplete="email"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'login-error' : undefined}
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="login-password" style={{ color: C.offWhite, fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    className="auth-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    required autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'login-error' : undefined}
                    value={password} onChange={e => setPassword(e.target.value)}
                    style={{ paddingRight: 48 }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    aria-pressed={showPass}
                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: C.grayAtla, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && (
                <div id="login-error" role="alert" style={{ background: 'rgba(220,50,50,.12)', border: '1px solid rgba(220,50,50,.25)', borderRadius: 10, padding: '10px 14px' }}>
                  <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{error}</p>
                </div>
              )}

              <Press>
                <button type="submit" disabled={loading} style={{ ...BTN_PRIMARY, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
                  {loading ? <><Spinner />&nbsp;Signing in...</> : 'Log In'}
                </button>
              </Press>
            </form>
          </div>

          {/* Footer link */}
          <p style={{ textAlign: 'center', color: C.grayBody, fontSize: 14, margin: 0 }}>
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" style={{ color: C.amberMuted, textDecoration: 'none', fontWeight: 600 }}>
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Home bar */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', paddingBottom: 10 }}>
        <div style={{ width: 134, height: 5, background: 'rgba(255,255,255,.18)', borderRadius: 3 }} />
      </div>
    </div>
  )
}

/* ── Micro components ──────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
