'use client'

import { CSSProperties } from 'react'
import Link from 'next/link'
import { MapPin, Mail } from 'lucide-react'

const C = {
  screenBg:    'linear-gradient(145deg, #06061c, #0a1020, #071216)',
  amberBase:   '#f5a623',
  amberLight:  '#f8c04a',
  amberMuted:  'rgba(210,165,80,.78)',
  white:       '#ffffff',
  grayBody:    '#3e3e5c',
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

export default function SignUpSuccessPage() {
  return (
    <div style={{ ...FONT, minHeight: '100dvh', background: C.screenBg, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      <Orb color={C.orbAmber}  top="-80px" left="50%" size={440} cx />
      <Orb color={C.orbPurple} bottom="-60px" left="-80px" size={300} />
      <Orb color={C.orbTeal}   top="50%" right="-70px" size={260} />

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 40px' }}>
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 28 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <MapPin size={28} color={C.amberBase} strokeWidth={2.5} />
            <span style={{ color: C.white, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Tripper</span>
          </div>

          <div style={{
            background: C.glassFill, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${C.glassBorder}`, borderRadius: 20, padding: '32px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: `linear-gradient(145deg, ${C.amberLight}, ${C.amberBase})`,
              boxShadow: `0 0 28px ${C.orbAmber}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mail size={24} color={C.btnText} strokeWidth={2.5} />
            </div>

            <h1 style={{ color: C.white, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Check your email
            </h1>
            <p style={{ color: C.grayBody, fontSize: 14, fontWeight: 400, lineHeight: 1.6, margin: 0 }}>
              We&apos;ve sent a confirmation link to your inbox. Click it to verify your account and start planning.
            </p>

            <Link href="/login" style={{ color: C.amberMuted, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              Return to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
