'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { CURRENCY_SYMBOLS, type TripCurrency } from '@/types';
import { showToast } from '@/components/ui/toast';
import {
  budgetError,
  currencyError,
  dateError,
  destinationsError,
  titleError,
  vibeError,
} from '@/lib/trip-validation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Country {
  name: string;
  flag: string;
  lat: number;
  lng: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCENT = '#F59E0B';
const BG = 'linear-gradient(175deg, rgba(12,4,35,.97) 0%, rgba(0,0,20,.99) 100%)';
const BTN_GRAD = 'linear-gradient(130deg, #c27802 0%, #F59E0B 48%, #fde47a 100%)';

const VIBES = [
  { name: 'Road',     emoji: '🚗', from: '#1a2332', to: '#3d5166' },
  { name: 'Fly',      emoji: '✈️', from: '#0f2560', to: '#2563eb' },
  { name: 'Camp',     emoji: '⛺', from: '#0a3320', to: '#16a34a' },
  { name: 'Beach',    emoji: '🏖️', from: '#093345', to: '#0891b2' },
  { name: 'Mountain', emoji: '🏔️', from: '#1e1260', to: '#7c3aed' },
  { name: 'Backpack', emoji: '🎒', from: '#5c1a07', to: '#ea580c' },
];

const COUNTRIES: Country[] = [
  { name: 'Japan',     flag: '🇯🇵', lat: 36,  lng: 138  },
  { name: 'Thailand',  flag: '🇹🇭', lat: 15,  lng: 101  },
  { name: 'Greece',    flag: '🇬🇷', lat: 39,  lng: 22   },
  { name: 'Portugal',  flag: '🇵🇹', lat: 39,  lng: -8   },
  { name: 'Italy',     flag: '🇮🇹', lat: 42,  lng: 12   },
  { name: 'France',    flag: '🇫🇷', lat: 46,  lng: 2    },
  { name: 'Spain',     flag: '🇪🇸', lat: 40,  lng: -3   },
  { name: 'USA',       flag: '🇺🇸', lat: 38,  lng: -97  },
  { name: 'Turkey',    flag: '🇹🇷', lat: 39,  lng: 35   },
  { name: 'Germany',   flag: '🇩🇪', lat: 51,  lng: 10   },
  { name: 'Iceland',   flag: '🇮🇸', lat: 65,  lng: -18  },
  { name: 'Morocco',   flag: '🇲🇦', lat: 32,  lng: -5   },
  { name: 'Mexico',    flag: '🇲🇽', lat: 23,  lng: -102 },
  { name: 'Australia', flag: '🇦🇺', lat: -25, lng: 133  },
];

const CURRENCIES = Object.keys(CURRENCY_SYMBOLS) as TripCurrency[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nightsBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}

function fmtDate(d: string) {
  if (!d) return { day: '--', my: '--- ----' };
  const dt = new Date(d + 'T00:00:00');
  return {
    day: dt.getDate().toString(),
    my: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  };
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Orbs() {
  return (
    <>
      <div style={{ position: 'absolute', top: -110, left: -80, width: 350, height: 350, background: 'radial-gradient(circle, rgba(70,20,175,.28) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: 60, right: -100, width: 310, height: 310, background: 'radial-gradient(circle, rgba(20,55,195,.2) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, height: 180, background: 'radial-gradient(ellipse, rgba(245,158,11,.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: BG, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', margin: '0 auto' }}>
      <Orbs />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, padding: '0 24px 40px' }}>
        {children}
      </div>
    </div>
  );
}

function Dots({ step }: { step: number }) {
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

function Header({ step, onBack }: { step: number; onBack: () => void }) {
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

function Label({ children, htmlFor, id }: { children: string; htmlFor?: string; id?: string }) {
  const style = { margin: '0 0 14px', fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: 'rgba(200,185,255,.38)' };
  if (htmlFor) return <label id={id} htmlFor={htmlFor} style={style}>{children}</label>;
  return (
    <p id={id} style={style}>
      {children}
    </p>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return <p id={id} role="alert" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.4, color: '#fca5a5' }}>{message}</p>;
}

function ContinueBtn({ onClick, label = 'Continue →' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} style={{ width: '100%', height: 62, borderRadius: 20, background: BTN_GRAD, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 17, fontWeight: 700, color: '#1a0e00', letterSpacing: '-.2px', outline: 'none', flexShrink: 0, boxShadow: `0 8px 32px ${ACCENT}55, inset 0 1px 0 rgba(255,255,255,.35)` }}>
      {label}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', height: 50, borderRadius: 16, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,.4)', outline: 'none', flexShrink: 0, marginTop: 12 }}>
      Back
    </button>
  );
}

function CalIcon({ color = ACCENT }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth="2" />
      <path d="M8 2v4M16 2v4M3 10h18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Step 1 — Trip Identity ───────────────────────────────────────────────────

function Step1({ name, setName, vibe, setVibe, onNext, onBack }: {
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

// ─── Step 2 — Dates ───────────────────────────────────────────────────────────

function DateCard({ label, fmt, dateVal, onChange, inputRef, describedBy, invalid }: {
  label: string;
  fmt: { day: string; my: string };
  dateVal: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const inputId = `trip-${label.toLowerCase()}-date`;

  return (
    <div
      style={{ flex: 1, borderRadius: 22, padding: '18px 16px', background: 'rgba(255,255,255,.04)', border: `1.5px solid ${focused ? ACCENT : dateVal ? `${ACCENT}66` : 'rgba(255,255,255,.08)'}`, boxShadow: focused ? `0 0 0 3px ${ACCENT}22` : 'none', position: 'relative', cursor: 'pointer', transition: 'border .2s, box-shadow .2s', backdropFilter: 'blur(12px)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <CalIcon />
        <label htmlFor={inputId} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(200,185,255,.5)', letterSpacing: '.8px', textTransform: 'uppercase' as const }}>{label}</label>
      </div>
      <div style={{ fontSize: 38, fontWeight: 800, color: dateVal ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.2)', letterSpacing: '-1.5px', lineHeight: 1 }}>{fmt.day}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>{fmt.my}</div>
      <input
        id={inputId}
        ref={inputRef}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        type="date"
        value={dateVal}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 1 }}
      />
    </div>
  );
}

function Step2({ startDate, setStartDate, endDate, setEndDate, onNext, onBack }: {
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
  onNext: () => void; onBack: () => void;
}) {
  const nights = nightsBetween(startDate, endDate);
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const validate = () => {
    const nextError = dateError(startDate, endDate);
    setError(nextError);
    if (!nextError) return onNext();
    if (!startDate) startRef.current?.focus();
    else endRef.current?.focus();
  };
  const updateStart = (value: string) => { setStartDate(value); setError(null); };
  const updateEnd = (value: string) => { setEndDate(value); setError(null); };
  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={2} onBack={onBack} />
      <Dots step={2} />
      <Label>When are you going?</Label>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <DateCard label="Departure" fmt={fmtDate(startDate)} dateVal={startDate} onChange={updateStart} inputRef={startRef} describedBy={error ? 'date-error' : undefined} invalid={Boolean(error)} />
        <DateCard label="Return" fmt={fmtDate(endDate)} dateVal={endDate} onChange={updateEnd} inputRef={endRef} describedBy={error ? 'date-error' : undefined} invalid={Boolean(error)} />
      </div>
      <FieldError id="date-error" message={error} />

      {nights > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${ACCENT}18`, border: `1px solid ${ACCENT}44`, borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: ACCENT }}>
            🌙 {nights} night{nights !== 1 ? 's' : ''} · {nights + 1} day{nights + 1 !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div style={{ borderRadius: 18, padding: '16px 18px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', marginTop: error ? 16 : 0, marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>Dates are optional</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>Leave both blank if you haven&apos;t decided yet.</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <ContinueBtn onClick={validate} />
      <BackBtn onClick={onBack} />
    </Shell>
  );
}

// ─── Mini Globe ───────────────────────────────────────────────────────────────

function MiniGlobe({ destinations }: { destinations: Country[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.42;
    const avgLng = destinations.length > 0
      ? destinations.reduce((s, d) => s + d.lng, 0) / destinations.length
      : 10;

    const proj = (lat: number, lng: number) => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lng - avgLng) * Math.PI / 180;
      return {
        x: cx + R * Math.sin(phi) * Math.sin(theta),
        y: cy - R * Math.cos(phi),
        vis: Math.cos(theta) > -0.1,
      };
    };

    ctx.clearRect(0, 0, W, H);

    const grd = ctx.createRadialGradient(cx - R * .25, cy - R * .25, R * .1, cx, cy, R);
    grd.addColorStop(0, 'rgba(60,30,140,.7)');
    grd.addColorStop(1, 'rgba(10,4,40,.9)');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(130,80,240,.2)'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.setLineDash([2, 4]); ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(160,130,255,.15)';
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); let first = true;
      for (let l = -180; l <= 180; l += 4) {
        const p = proj(lat, l);
        if (p.vis) {
          if (first) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
          first = false;
        } else {
          first = true;
        }
      }
      ctx.stroke();
    }
    for (let lng = -150; lng <= 180; lng += 30) {
      ctx.beginPath(); let first = true;
      for (let a = -80; a <= 80; a += 4) {
        const p = proj(a, lng);
        if (p.vis) {
          if (first) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
          first = false;
        } else {
          first = true;
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    destinations.forEach(d => {
      const p = proj(d.lat, d.lng);
      if (!p.vis) return;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
      g.addColorStop(0, `${ACCENT}55`); g.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
    });
  }, [destinations]);

  return <canvas ref={ref} width={342} height={190} style={{ borderRadius: 16, display: 'block' }} />;
}

// ─── Step 3 — Destinations ────────────────────────────────────────────────────

function Step3({ destinations, setDestinations, onNext, onBack }: {
  destinations: Country[];
  setDestinations: React.Dispatch<React.SetStateAction<Country[]>>;
  onNext: () => void; onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) &&
    !destinations.find(d => d.name === c.name)
  );
  const options = filtered.slice(0, 6);
  const popular = COUNTRIES.filter(c =>
    ['Japan', 'Thailand', 'Greece', 'Portugal'].includes(c.name) &&
    !destinations.find(d => d.name === c.name)
  );

  const add = (c: Country) => { setDestinations(p => [...p, c]); setQuery(''); setShowDrop(false); setActiveIndex(0); setError(null); };
  const rem = (name: string) => setDestinations(p => p.filter(d => d.name !== name));
  const validate = () => {
    const nextError = destinationsError(destinations);
    setError(nextError);
    if (!nextError) return onNext();
    searchRef.current?.focus();
  };

  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={3} onBack={onBack} />
      <Dots step={3} />
      <Label htmlFor="country-search">Where are you going?</Label>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <div style={{ height: 54, borderRadius: 18, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={ACCENT} strokeWidth="2" />
            <circle cx="12" cy="9" r="2.5" stroke={ACCENT} strokeWidth="1.5" />
          </svg>
          <input
            id="country-search"
            ref={searchRef}
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-controls="country-options"
            aria-expanded={showDrop && query.length > 0 && options.length > 0}
            aria-activedescendant={showDrop && query && options[activeIndex] ? `country-option-${activeIndex}` : undefined}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); setActiveIndex(0); }}
            onFocus={() => setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && options.length) {
                e.preventDefault(); setShowDrop(true); setActiveIndex(i => (i + 1) % options.length);
              } else if (e.key === 'ArrowUp' && options.length) {
                e.preventDefault(); setShowDrop(true); setActiveIndex(i => (i - 1 + options.length) % options.length);
              } else if (e.key === 'Enter' && showDrop && options[activeIndex]) {
                e.preventDefault(); add(options[activeIndex]);
              } else if (e.key === 'Escape') {
                e.preventDefault(); setShowDrop(false);
              }
            }}
            placeholder="Search countries..."
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'destinations-error' : undefined}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, color: 'rgba(255,255,255,.85)', caretColor: ACCENT }}
          />
        </div>
        {showDrop && query && options.length > 0 && (
          <div id="country-options" role="listbox" aria-label="Country suggestions" style={{ position: 'absolute', top: 58, left: 0, right: 0, background: 'rgba(14,8,38,.97)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, overflow: 'hidden', zIndex: 20 }}>
            {options.map((c, index) => (
              <div id={`country-option-${index}`} key={c.name} role="option" aria-selected={index === activeIndex} onMouseDown={(e) => e.preventDefault()} onClick={() => add(c)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.05)', background: index === activeIndex ? 'rgba(245,158,11,.14)' : 'transparent' }}>
                <span style={{ fontSize: 22 }}>{c.flag}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,.85)' }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <FieldError id="destinations-error" message={error} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 36, marginBottom: 16 }}>
        {destinations.length === 0
          ? <div style={{ height: 36, borderRadius: 18, padding: '0 14px', display: 'flex', alignItems: 'center', border: '1.5px dashed rgba(255,255,255,.15)', fontSize: 13, color: 'rgba(255,255,255,.25)' }}>No destinations yet</div>
          : destinations.map(d => (
            <div key={d.name} style={{ height: 36, borderRadius: 18, padding: '0 10px 0 12px', display: 'flex', alignItems: 'center', gap: 6, background: `${ACCENT}15`, border: `1.5px solid ${ACCENT}66`, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.85)' }}>
              <span>{d.flag}</span>
              <span>{d.name}</span>
              <button onClick={() => rem(d.name)} aria-label={`Remove ${d.name}`} style={{ width: 44, height: 44, margin: '-4px -8px -4px 0', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(255,255,255,.5)', fontSize: 15, lineHeight: 1, outline: 'none' }}>✕</button>
            </div>
          ))
        }
      </div>

      <div style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 20, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
        <MiniGlobe destinations={destinations} />
      </div>

      {popular.length > 0 && (
        <>
          <Label>Popular</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {popular.map(c => (
              <button key={c.name} onClick={() => add(c)} style={{ minHeight: 44, borderRadius: 22, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.7)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                <span>{c.flag}</span><span>{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />
      <ContinueBtn onClick={validate} />
      <BackBtn onClick={onBack} />
    </Shell>
  );
}

// ─── Step 4 — Budget ──────────────────────────────────────────────────────────

function Step4({ budget, setBudget, currency, setCurrency, nights, onNext, onBack }: {
  budget: string; setBudget: (v: string) => void;
  currency: string; setCurrency: (v: string) => void;
  nights: number; onNext: () => void; onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sym = CURRENCY_SYMBOLS[currency as TripCurrency] ?? currency;
  const raw = parseFloat(budget) || 0;
  const perDay = nights > 0 && raw > 0 ? Math.round(raw / (nights + 1)) : 0;
  const maxBudget = currency === 'TRY' ? 100000 : 10000;
  const barW = Math.min(100, (raw / maxBudget) * 100);
  const validate = () => {
    const nextError = budgetError(budget) ?? currencyError(currency);
    setError(nextError);
    if (!nextError) return onNext();
    if (budgetError(budget)) inputRef.current?.focus();
    else currencyRef.current?.focus();
  };

  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={4} onBack={onBack} />
      <Dots step={4} />
      <Label htmlFor="trip-total-budget">Total budget</Label>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: ACCENT, opacity: .85, marginBottom: 4 }}>{sym}</span>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'text' }}>
          <span style={{ fontSize: 64, fontWeight: 900, letterSpacing: '-3px', color: raw > 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.15)', lineHeight: 1 }}>
            {raw > 0 ? raw.toLocaleString() : '0'}
          </span>
          {focused && (
            <span style={{ width: 3, height: 52, background: ACCENT, marginLeft: 4, borderRadius: 2, display: 'inline-block', animation: 'cursorBlink 1s step-end infinite' }} />
          )}
          <input
            id="trip-total-budget"
            ref={inputRef}
            type="number"
            value={budget}
            min="0"
            max="99999999.99"
            step="0.01"
            inputMode="decimal"
            aria-label="Total budget"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'budget-error' : undefined}
            onChange={e => { setBudget(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') validate(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'text' }}
          />
        </div>
        <FieldError id="budget-error" message={error} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 32 }}>
        {CURRENCIES.map((c, index) => (
          <button ref={index === 0 ? currencyRef : undefined} key={c} aria-pressed={currency === c} onClick={() => { setCurrency(c); setError(null); }} style={{ height: 36, borderRadius: 18, padding: '0 16px', background: currency === c ? `${ACCENT}22` : 'rgba(255,255,255,.05)', border: `1.5px solid ${currency === c ? ACCENT : 'rgba(255,255,255,.1)'}`, fontSize: 13, fontWeight: 600, color: currency === c ? ACCENT : 'rgba(255,255,255,.5)', cursor: 'pointer', outline: 'none', transition: 'all .2s', fontFamily: 'inherit' }}>
            {c}
          </button>
        ))}
      </div>

      {raw > 0 && (
        <div style={{ borderRadius: 18, padding: '16px 18px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalIcon />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>Per day</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{nights} nights</div>
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'rgba(255,255,255,.9)' }}>~{sym}{perDay.toLocaleString()}</div>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${barW}%`, background: BTN_GRAD, borderRadius: 2, transition: 'width .4s ease' }} />
          </div>
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.25)', margin: '0 0 20px' }}>You can always update this later</p>

      <div style={{ flex: 1 }} />
      <ContinueBtn onClick={validate} />
      <BackBtn onClick={onBack} />
    </Shell>
  );
}

// ─── Step 5 — Review & Create ─────────────────────────────────────────────────

function Step5({ name, vibe, startDate, endDate, destinations, budget, currency, onBack }: {
  name: string; vibe: string | null; startDate: string; endDate: string;
  destinations: Country[]; budget: string; currency: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const sym = CURRENCY_SYMBOLS[currency as TripCurrency] ?? currency;
  const raw = parseFloat(budget) || 0;
  const nights = nightsBetween(startDate, endDate);
  const perDay = nights > 0 && raw > 0 ? Math.round(raw / (nights + 1)) : 0;
  const sf = fmtDate(startDate);
  const ef = fmtDate(endDate);
  const vibeEmoji = VIBES.find(v => v.name === vibe)?.emoji ?? '✈️';

  const create = async () => {
    if (loading || done) return;
    const invalid = titleError(name) ?? vibeError(vibe) ?? dateError(startDate, endDate) ??
      destinationsError(destinations) ?? budgetError(budget) ?? currencyError(currency);
    if (invalid) {
      setSubmissionError(invalid);
      requestAnimationFrame(() => createRef.current?.focus());
      return;
    }
    setSubmissionError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_trip_with_stops', {
        p_title: name.trim(),
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_total_budget: raw,
        p_currency: currency,
        p_vibe: vibe,
        p_countries: destinations,
        p_focus_lat: destinations[0]?.lat ?? null,
        p_focus_lng: destinations[0]?.lng ?? null,
      });
      const tripId = (data as { trip_id?: string } | null)?.trip_id;
      if (!error && tripId) {
        setDone(true);
        router.push(`/trip/${tripId}/mobile`);
      } else {
        showToast(error?.message ?? 'Failed to create trip. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={5} onBack={onBack} />
      <Dots step={5} />

      {/* Summary card */}
      <div style={{ borderRadius: 22, overflow: 'hidden', marginBottom: 20, border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ height: 4, background: BTN_GRAD }} />
        <div style={{ padding: '20px 18px', background: 'rgba(255,255,255,.04)', backdropFilter: 'blur(16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
              {vibeEmoji}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,.95)', letterSpacing: '-.4px' }}>{name || 'My Trip'}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{vibe ? `${vibe} trip` : 'Road trip'}</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '0 0 14px' }} />
          {(startDate || endDate) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CalIcon color="rgba(255,255,255,.4)" />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
                {startDate ? `${sf.day} ${sf.my}` : '—'} → {endDate ? `${ef.day} ${ef.my}` : '—'}
                {nights > 0 && <span style={{ color: 'rgba(255,255,255,.3)', marginLeft: 8 }}>({nights}n)</span>}
              </span>
            </div>
          )}
          {destinations.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {destinations.map(d => (
                <span key={d.name} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)' }}>
                  {d.flag} {d.name}
                </span>
              ))}
            </div>
          )}
          {raw > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Budget</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>{sym}{raw.toLocaleString()}</span>
                {perDay > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: `${ACCENT}22`, color: ACCENT, fontWeight: 600 }}>
                    {sym}{perDay}/day
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Label>Invite a co-pilot</Label>
      <div style={{ borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', marginBottom: 24 }}>
        <span style={{ fontSize: 16 }}>🔗</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.5 }}>
          An invite code is generated with your trip — copy it anytime from your trips list.
        </span>
      </div>

      <BackBtn onClick={onBack} />
      <FieldError id="create-error" message={submissionError} />
      <div style={{ height: 12 }} />
      <button
        ref={createRef}
        onClick={create}
        disabled={loading || done}
        aria-describedby={submissionError ? 'create-error' : undefined}
        style={{ width: '100%', height: 70, borderRadius: 22, background: done ? 'linear-gradient(130deg, #14532d, #22c55e)' : BTN_GRAD, border: 'none', cursor: loading || done ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 18, fontWeight: 700, color: done ? '#fff' : '#1a0e00', letterSpacing: '-.3px', outline: 'none', boxShadow: done ? '0 8px 32px rgba(34,197,94,.4)' : `0 8px 32px ${ACCENT}55`, transition: 'all .4s ease' }}
      >
        {done ? '✓ Trip Created!' : loading ? 'Creating...' : 'Create Trip 🚀'}
      </button>
    </Shell>
  );
}

// ─── Root Wizard ──────────────────────────────────────────────────────────────

export function NewTripClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dir,  setDir]  = useState(1);

  const [name,        setName]        = useState('');
  const [vibe,        setVibe]        = useState<string | null>(null);
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [destinations,setDestinations]= useState<Country[]>([]);
  const [budget,      setBudget]      = useState('');
  const [currency,    setCurrency]    = useState('EUR');

  const nights = nightsBetween(startDate, endDate);

  const next = useCallback(() => { setDir(1);  setStep(s => s + 1); }, []);
  const back = useCallback(() => {
    if (step === 1) { router.back(); return; }
    setDir(-1); setStep(s => s - 1);
  }, [step, router]);

  const variants = {
    enter:  (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  const common = { onNext: next, onBack: back };

  return (
    <div style={{ width: '100%', minHeight: '100svh', background: '#000010', fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif", overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0 }
        input[type=number] { -moz-appearance:textfield }
        * { scrollbar-width:none }
        *::-webkit-scrollbar { display:none }
      `}</style>

      <AnimatePresence custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, minHeight: '100svh' }}
        >
          {step === 1 && <Step1 name={name} setName={setName} vibe={vibe} setVibe={setVibe} {...common} />}
          {step === 2 && <Step2 startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} {...common} />}
          {step === 3 && <Step3 destinations={destinations} setDestinations={setDestinations} {...common} />}
          {step === 4 && <Step4 budget={budget} setBudget={setBudget} currency={currency} setCurrency={setCurrency} nights={nights} {...common} />}
          {step === 5 && <Step5 name={name} vibe={vibe} startDate={startDate} endDate={endDate} destinations={destinations} budget={budget} currency={currency} onBack={back} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
