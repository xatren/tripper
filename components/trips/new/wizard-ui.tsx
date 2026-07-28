'use client';

import { DUSK, SUNSET_GRADIENT } from '@/components/design/tokens';
import type { SelectedTripCountry } from '@/lib/trip-country-selection';

export type Country = SelectedTripCountry;

export const ACCENT = DUSK.amber;
export const BTN_GRAD = SUNSET_GRADIENT;

export const VIBES = [
  { name: 'Road',     emoji: '🚗', from: '#1a2332', to: '#3d5166' },
  { name: 'Fly',      emoji: '✈️', from: '#0f2560', to: '#2563eb' },
  { name: 'Camp',     emoji: '⛺', from: '#0a3320', to: '#16a34a' },
  { name: 'Beach',    emoji: '🏖️', from: '#093345', to: '#0891b2' },
  { name: 'Mountain', emoji: '🏔️', from: '#1e1260', to: '#7c3aed' },
  { name: 'Backpack', emoji: '🎒', from: '#5c1a07', to: '#ea580c' },
];

export function nightsBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}

export function fmtDate(d: string) {
  if (!d) return { day: '--', my: '--- ----' };
  const dt = new Date(d + 'T00:00:00');
  return {
    day: dt.getDate().toString(),
    my: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  };
}

export function Orbs() {
  return (
    <>
      <div style={{ position: 'absolute', top: -110, left: -80, width: 350, height: 350, background: 'radial-gradient(circle, rgba(70,20,175,.28) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: 60, right: -100, width: 310, height: 310, background: 'radial-gradient(circle, rgba(20,55,195,.2) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, height: 180, background: 'radial-gradient(ellipse, rgba(245,158,11,.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
    </>
  );
}

export function Shell({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  return (
    <div className="atmosphere" style={{ width: '100%', maxWidth: 430, minHeight: '100svh', height: scroll ? '100svh' : undefined, position: 'relative', overflowX: 'hidden', overflowY: scroll ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', margin: '0 auto', overscrollBehavior: 'contain' }}>
      <Orbs />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, padding: '0 24px 40px' }}>
        {children}
      </div>
    </div>
  );
}

export function Dots({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexShrink: 0, marginBottom: 52 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: i < step ? ACCENT : 'rgba(255,255,255,.1)',
          border: i < step ? 'none' : '1.5px solid rgba(255,255,255,.18)',
          boxShadow: i === step - 1
            ? `0 0 10px ${ACCENT}dd, 0 0 20px ${ACCENT}77`
            : i < step - 1 ? `0 0 6px ${ACCENT}88` : 'none',
          transition: 'all .4s ease',
        }} />
      ))}
    </div>
  );
}

export function Header({ step, onBack }: { step: number; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 26 }}>
      <button onClick={onBack} aria-label="Go back" style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', outline: 'none', padding: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M15 19L8 12L15 5" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,.95)', letterSpacing: '-.3px' }}>New Trip</h2>
      <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(180,160,255,.13)', borderRadius: 20, padding: '7px 14px' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(200,185,255,.7)' }}>{step} of 5</span>
      </div>
    </div>
  );
}

export function Label({ children, htmlFor, id }: { children: string; htmlFor?: string; id?: string }) {
  const style = { margin: '0 0 14px', fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: 'rgba(200,185,255,.38)' };
  if (htmlFor) return <label id={id} htmlFor={htmlFor} style={style}>{children}</label>;
  return (
    <p id={id} style={style}>
      {children}
    </p>
  );
}

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return <p id={id} role="alert" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.4, color: '#fca5a5' }}>{message}</p>;
}

export function ContinueBtn({ onClick, label = 'Continue →', disabled = false }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{ width: '100%', height: 62, borderRadius: 20, background: disabled ? 'rgba(255,255,255,.075)' : BTN_GRAD, border: disabled ? '1px solid rgba(255,255,255,.08)' : 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 17, fontWeight: 700, color: disabled ? 'rgba(255,255,255,.28)' : DUSK.onAmber, letterSpacing: '-.2px', outline: 'none', flexShrink: 0, boxShadow: disabled ? 'none' : `0 8px 32px ${ACCENT}55, inset 0 1px 0 rgba(255,255,255,.35)`, transition: 'background .2s, color .2s, box-shadow .2s' }}>
      {label}
    </button>
  );
}

export function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', height: 50, borderRadius: 16, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,.4)', outline: 'none', flexShrink: 0, marginTop: 12 }}>
      Back
    </button>
  );
}

export function CalIcon({ color = ACCENT }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth="2" />
      <path d="M8 2v4M16 2v4M3 10h18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
