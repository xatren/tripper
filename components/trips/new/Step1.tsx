'use client';

import { useRef, useState } from 'react';
import { titleError, vibeError } from '@/lib/trip-validation';
import { ACCENT, ContinueBtn, Dots, FieldError, Header, Label, Shell, VIBES } from './wizard-ui';

export function Step1({ name, setName, vibe, setVibe, onNext, onBack }: {
  name: string; setName: (v: string) => void;
  vibe: string | null; setVibe: (v: string) => void;
  onNext: () => void; onBack: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const vibeRef = useRef<HTMLButtonElement>(null);
  const validate = () => {
    const nextError = titleError(name) ?? vibeError(vibe);
    setError(nextError);
    if (!nextError) return onNext();
    if (titleError(name)) nameRef.current?.focus();
    else vibeRef.current?.focus();
  };
  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={1} onBack={onBack} />
      <Dots step={1} />

      <div style={{ flexShrink: 0, marginBottom: 44 }}>
        <Label htmlFor="trip-name">What&apos;s the trip called?</Label>
        <div style={{ position: 'relative', paddingBottom: 14 }}>
          <input
            id="trip-name"
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') validate(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-invalid={Boolean(error && titleError(name))}
            aria-describedby={error ? 'identity-error' : undefined}
            placeholder="Trip name..."
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 34, fontWeight: 800, color: 'rgba(255,255,255,.95)', caretColor: ACCENT, padding: 0, display: 'block', lineHeight: 1.25 }}
          />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1, background: focused ? ACCENT : 'rgba(255,255,255,.13)', transition: 'background .3s, box-shadow .3s', boxShadow: focused ? `0 0 14px ${ACCENT}cc, 0 0 32px ${ACCENT}66` : 'none' }} />
        </div>
      </div>

      <div style={{ flexShrink: 0, marginBottom: 32 }}>
        <Label id="vibe-label">Pick a vibe</Label>
        <div role="group" aria-labelledby="vibe-label" aria-describedby={error ? 'identity-error' : undefined} style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -24px', padding: '4px 24px 10px', scrollbarWidth: 'none', outline: 'none' }}>
          {VIBES.map((v, index) => {
            const sel = vibe === v.name;
            return (
              <button ref={index === 0 ? vibeRef : undefined} key={v.name} aria-pressed={sel} onClick={() => { setVibe(v.name); setError(null); }} style={{ background: `linear-gradient(145deg, ${v.from} 0%, ${v.to} 100%)`, borderRadius: 18, width: 72, height: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, border: sel ? `2px solid ${ACCENT}` : '2px solid rgba(255,255,255,.07)', boxShadow: sel ? `0 0 0 3px ${ACCENT}2e, 0 0 20px ${ACCENT}55` : '0 2px 12px rgba(0,0,0,.55)', outline: 'none', padding: 0, transition: 'border .2s, box-shadow .2s' }}>
                <span style={{ fontSize: 26, lineHeight: 1, display: 'block', marginBottom: 5 }}>{v.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.88)', letterSpacing: '.3px' }}>{v.name}</span>
              </button>
            );
          })}
        </div>
        <FieldError id="identity-error" message={error} />
      </div>

      <div style={{ flex: 1 }} />
      <ContinueBtn onClick={validate} />
    </Shell>
  );
}
