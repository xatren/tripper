'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSafeRedirectPath } from '@/lib/safe-redirect'
import { isValidLoginIdentifier, loginIdentifierToEmail } from '@/lib/auth/username'
import { DuskAuthShell } from '@/components/auth/DuskAuthShell'
import { GoogleGlyph, Press } from '@/components/onboarding/dusk/JourneyChrome'
import { DUSK, FONT_INTER, pillGhost, pillPrimary } from '@/components/onboarding/dusk/tokens'

/* ═══════════════════════════════════════════════════════════════════
   PAGE — Dusk Edition presentation over the existing Supabase flow.
═══════════════════════════════════════════════════════════════════ */
export default function LoginPage() {
  const [username, setUsername]           = useState('')
  const [password, setPassword]           = useState('')
  const [showPass, setShowPass]           = useState(false)
  const [loading, setLoading]             = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidLoginIdentifier(username)) {
      setError('Enter a valid username or email address')
      return
    }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: loginIdentifierToEmail(username), password })
    if (error) {
      setError(error.code === 'invalid_credentials' ? 'Incorrect username/email or password' : error.message)
      setLoading(false)
    }
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
    <DuskAuthShell variant="login">
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="login-username"
            style={{ ...FONT_INTER, color: DUSK.textSecondary, fontSize: 13, fontWeight: 500 }}
          >
            Username or email
          </label>
          <input
            id="login-username"
            className="auth-input"
            type="text" placeholder="Username or you@example.com"
            required autoComplete="username"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : undefined}
            value={username} onChange={e => setUsername(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="login-password"
            style={{ ...FONT_INTER, color: DUSK.textSecondary, fontSize: 13, fontWeight: 500 }}
          >
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              className="auth-input"
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              required autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ paddingRight: 48 }}
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              aria-label={showPass ? 'Hide password' : 'Show password'}
              aria-pressed={showPass}
              style={{
                position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer',
                color: DUSK.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {error && (
          <p id="login-error" role="alert" style={{ ...FONT_INTER, color: '#ff8a5e', fontSize: 13, margin: '-8px 0 0' }}>
            {error}
          </p>
        )}

        <Press>
          <button type="submit" disabled={loading} style={{ ...pillPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Signing in…' : 'Log In'}
          </button>
        </Press>
      </form>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.10)' }} />
        <span style={{ ...FONT_INTER, color: DUSK.textMuted, fontSize: 12 }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.10)' }} />
      </div>

      <Press>
        <button type="button" onClick={handleGoogle} disabled={googleLoading}
          style={{ ...pillGhost, opacity: googleLoading ? 0.6 : 1 }}>
          <GoogleGlyph />
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>
      </Press>

      <p style={{ ...FONT_INTER, textAlign: 'center', color: DUSK.textSecondary, fontSize: 14, margin: 0 }}>
        New here?{' '}
        <Link href="/sign-up" style={{ color: DUSK.amber, textDecoration: 'none', fontWeight: 600 }}>
          Sign up
        </Link>
      </p>
    </DuskAuthShell>
  )
}
