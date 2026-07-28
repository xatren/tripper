'use client'

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { DuskAuthShell } from '@/components/auth/DuskAuthShell'
import { DUSK, FONT_INTER, glassCard, SUNSET_GRADIENT } from '@/components/design/tokens'

export default function SignUpSuccessPage() {
  return (
    <DuskAuthShell variant="success">
      <div style={{ ...glassCard(), padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: SUNSET_GRADIENT,
            boxShadow: '0 0 28px rgba(245,150,70,.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Mail size={24} color={DUSK.onAmber} strokeWidth={2.5} />
        </div>

        <p style={{ ...FONT_INTER, color: DUSK.textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          We&apos;ve sent a confirmation link to your inbox. Click it to verify your account and start planning.
        </p>

        <Link href="/login" style={{ ...FONT_INTER, color: DUSK.amber, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Return to login
        </Link>
      </div>
    </DuskAuthShell>
  )
}
