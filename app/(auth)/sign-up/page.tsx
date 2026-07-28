'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSafeRedirectPath } from '@/lib/safe-redirect'
import { USERNAME_PATTERN, usernameToEmail } from '@/lib/auth/username'
import { DuskAuthShell } from '@/components/auth/DuskAuthShell'
import { Press } from '@/components/onboarding/dusk/JourneyChrome'
import { DUSK, FONT_INTER, pillPrimary } from '@/components/onboarding/dusk/tokens'

/* ═══════════════════════════════════════════════════════════════════
   PAGE — Dusk Edition presentation over the existing sign-up flow.
═══════════════════════════════════════════════════════════════════ */
export default function SignUpPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const router = useRouter()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError('Username must be 3–30 characters and use only letters, numbers, or underscores')
      return
    }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }

    setLoading(true); setError(null)
    const supabase = createClient()
    const rawNext = new URLSearchParams(window.location.search).get('next')
    const safeNext = getSafeRedirectPath(rawNext, window.location.origin)
    const response = await fetch('/api/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const result = await response.json() as { error?: string }

    if (!response.ok) { setError(result.error ?? 'Could not create account'); setLoading(false); return }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    if (signInError) { setError(signInError.message); setLoading(false) }
    else router.push(safeNext)
  }

  return (
    <DuskAuthShell variant="sign-up">
      <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="signup-username"
            style={{ ...FONT_INTER, color: DUSK.textSecondary, fontSize: 13, fontWeight: 500 }}
          >
            Username
          </label>
          <input
            id="signup-username"
            className="auth-input"
            type="text" placeholder="Choose a username"
            required autoComplete="username"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'signup-error' : undefined}
            value={username} onChange={e => setUsername(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="signup-password"
            style={{ ...FONT_INTER, color: DUSK.textSecondary, fontSize: 13, fontWeight: 500 }}
          >
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="signup-password"
              className="auth-input"
              type={showPass ? 'text' : 'password'}
              placeholder="At least 6 characters"
              required autoComplete="new-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'signup-error' : undefined}
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

        {/* Password strength hint */}
        {password.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: password.length >= i * 2
                  ? i <= 2 ? DUSK.amberDeep : DUSK.amber
                  : 'rgba(255,255,255,.1)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>
        )}

        {error && (
          <p id="signup-error" role="alert" style={{ ...FONT_INTER, color: '#ff8a5e', fontSize: 13, margin: '-8px 0 0' }}>
            {error}
          </p>
        )}

        <Press>
          <button type="submit" disabled={loading} style={{ ...pillPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>
        </Press>
      </form>

      <p style={{ ...FONT_INTER, textAlign: 'center', color: DUSK.textSecondary, fontSize: 14, margin: 0 }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: DUSK.amber, textDecoration: 'none', fontWeight: 600 }}>
          Log in
        </Link>
      </p>
    </DuskAuthShell>
  )
}
