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

/* ── Small icon ────────────────────────────────────────────────────── */
function SmallIcon() {
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
      background: 'linear-gradient(145deg, #f8c04a, #e8821a)',
      boxShadow: `0 0 28px ${C.orbAmber}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <MapPin size={24} color="#e8821a" strokeWidth={2.5} fill="#ffffff" />
    </div>
  )
}

/* ── Field component ───────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: C.offWhite, fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════ */
export default function SignUpPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const router = useRouter()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords don\'t match'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }

    setLoading(true); setError(null)
    const supabase = createClient()
    const rawNext = new URLSearchParams(window.location.search).get('next')
    const safeNext = getSafeRedirectPath(rawNext, window.location.origin)
    const emailRedirectTo = new URL('/auth/callback', window.location.origin)
    emailRedirectTo.searchParams.set('next', safeNext)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: emailRedirectTo.toString(),
        data: {
          full_name:    displayName || email.split('@')[0],
          display_name: displayName || email.split('@')[0],
        },
      },
    })

    if (error) { setError(error.message); setLoading(false) }
    else router.push('/sign-up/success')
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

      {/* Scrollable content */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, overflowY: 'auto', padding: '24px 24px 40px' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', gap: 28 }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SmallIcon />
            <div>
              <h1 style={{ color: C.white, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.1 }}>
                Create account
              </h1>
              <p style={{ color: C.graySubLand, fontSize: 13, fontWeight: 400, margin: '4px 0 0' }}>
                Sign up to start your adventure
              </p>
            </div>
          </div>

          {/* Glass card */}
          <div style={{ background: C.glassFill, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${C.glassBorder}`, borderRadius: 20, padding: '24px 20px' }}>
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <Field label="Full name">
                <input
                  className="auth-input"
                  type="text" placeholder="Your full name"
                  autoComplete="name"
                  value={displayName} onChange={e => setDisplayName(e.target.value)}
                />
              </Field>

              <Field label="Email">
                <input
                  className="auth-input"
                  type="email" placeholder="you@example.com"
                  required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </Field>

              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <input
                    className="auth-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    required autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    style={{ paddingRight: 48 }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.grayAtla, display: 'flex', alignItems: 'center' }}>
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirm password">
                <div style={{ position: 'relative' }}>
                  <input
                    className="auth-input"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    required autoComplete="new-password"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    style={{ paddingRight: 48 }}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.grayAtla, display: 'flex', alignItems: 'center' }}>
                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </Field>

              {/* Password strength hint */}
              {password.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: password.length >= i * 2
                        ? i <= 2 ? '#f5a623' : '#22c55e'
                        : 'rgba(255,255,255,.1)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
              )}

              {error && (
                <div style={{ background: 'rgba(220,50,50,.12)', border: '1px solid rgba(220,50,50,.25)', borderRadius: 10, padding: '10px 14px' }}>
                  <p style={{ color: '#ff6b6b', fontSize: 13, margin: 0 }}>{error}</p>
                </div>
              )}

              <Press>
                <button type="submit" disabled={loading}
                  style={{ ...BTN_PRIMARY, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
                  {loading
                    ? <><Spinner />&nbsp;Creating account...</>
                    : 'Sign Up'}
                </button>
              </Press>
            </form>
          </div>

          {/* Footer link */}
          <p style={{ textAlign: 'center', color: C.grayBody, fontSize: 14, margin: 0 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: C.amberMuted, textDecoration: 'none', fontWeight: 600 }}>
              Log in
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Home bar */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', paddingBottom: 10, flexShrink: 0 }}>
        <div style={{ width: 134, height: 5, background: 'rgba(255,255,255,.18)', borderRadius: 3 }} />
      </div>
    </div>
  )
}

/* ── Spinner ───────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ width: 16, height: 16, border: '2px solid rgba(15,15,26,.3)', borderTopColor: '#0f0f1a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  )
}
