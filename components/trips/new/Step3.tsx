'use client';

import { useMemo, useRef, useState } from 'react';
import { CountryGlobe } from '@/components/trips/new/CountryGlobe';
import {
  enableMultiCountry,
  getCountryOptions,
  removeCountry,
  searchCountries,
  selectCountry,
  type CountryOption,
  type CountrySelectionState,
} from '@/lib/trip-country-selection';
import { destinationsError } from '@/lib/trip-validation';
import { DUSK } from '@/components/design/tokens';
import { ACCENT, ContinueBtn, FieldError, Header, Label, Shell } from './wizard-ui';

export function Step3({ selection, setSelection, onNext, onBack }: {
  selection: CountrySelectionState;
  setSelection: React.Dispatch<React.SetStateAction<CountrySelectionState>>;
  onNext: () => void; onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const countries = useMemo(() => getCountryOptions('en'), []);
  const options = useMemo(() => searchCountries(countries, query).slice(0, 8), [countries, query]);
  const popular = useMemo(
    () => ['JP', 'TH', 'GR', 'PT'].map(code => countries.find(country => country.code === code)).filter((country): country is CountryOption => Boolean(country)),
    [countries],
  );
  const plural = selection.mode === 'multi-country';

  const choose = (country: CountryOption) => {
    setSelection(previous => selectCountry(previous, country));
    setQuery('');
    setShowDrop(false);
    setActiveIndex(0);
    setError(null);
  };
  const validate = () => {
    const nextError = destinationsError(selection.countries);
    setError(nextError);
    if (!nextError) return onNext();
    searchRef.current?.focus();
  };

  return (
    <Shell scroll>
      <div style={{ height: 'max(28px, env(safe-area-inset-top))', flexShrink: 0 }} />
      <Header step={3} onBack={onBack} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, maxWidth: 340, color: 'rgba(255,255,255,.96)', fontSize: 28, lineHeight: 1.12, letterSpacing: '-.8px', fontWeight: 800 }}>
          {plural ? 'Which countries are you visiting?' : 'Which country are you visiting?'}
        </h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(218,207,255,.5)', fontSize: 14, lineHeight: 1.45 }}>
          {plural ? 'Add the countries in the order you plan to visit them.' : 'We’ll tailor your recommendations to it.'}
        </p>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <div style={{ height: 54, borderRadius: 18, background: 'rgba(255,255,255,.055)', border: `1px solid ${showDrop ? 'rgba(245,158,11,.52)' : 'rgba(255,255,255,.1)'}`, boxShadow: showDrop ? `0 0 0 3px ${ACCENT}18` : 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', transition: 'border .2s, box-shadow .2s' }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={ACCENT} strokeWidth="2" />
            <path d="m16.4 16.4 4.1 4.1" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="country-search"
            ref={searchRef}
            value={query}
            role="combobox"
            aria-label="Search countries"
            aria-autocomplete="list"
            aria-controls="country-options"
            aria-expanded={showDrop && query.length > 0}
            aria-activedescendant={showDrop && query && options[activeIndex] ? `country-option-${activeIndex}` : undefined}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); setActiveIndex(0); setError(null); }}
            onFocus={() => setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && options.length) {
                e.preventDefault(); setShowDrop(true); setActiveIndex(i => (i + 1) % options.length);
              } else if (e.key === 'ArrowUp' && options.length) {
                e.preventDefault(); setShowDrop(true); setActiveIndex(i => (i - 1 + options.length) % options.length);
              } else if (e.key === 'Enter' && showDrop && options[activeIndex]) {
                e.preventDefault(); choose(options[activeIndex]);
              } else if (e.key === 'Escape') {
                e.preventDefault(); setShowDrop(false);
              }
            }}
            placeholder="Search countries..."
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'destinations-error' : undefined}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, color: 'rgba(255,255,255,.9)', caretColor: ACCENT }}
          />
          {query && <button type="button" aria-label="Clear country search" onMouseDown={event => event.preventDefault()} onClick={() => { setQuery(''); searchRef.current?.focus(); }} style={{ width: 44, height: 44, marginRight: -12, border: 0, background: 'transparent', color: 'rgba(255,255,255,.44)', fontSize: 18, cursor: 'pointer' }}>×</button>}
        </div>

        {showDrop && query && (
          <div id="country-options" role="listbox" aria-label="Country suggestions" style={{ position: 'absolute', top: 60, left: 0, right: 0, maxHeight: 316, overflowY: 'auto', background: 'rgba(14,8,38,.985)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 17, boxShadow: '0 18px 50px rgba(0,0,0,.48)', zIndex: 30 }}>
            {options.length === 0 ? (
              <div role="status" style={{ padding: '18px 16px', color: 'rgba(218,207,255,.48)', fontSize: 13 }}>No countries found for “{query}”.</div>
            ) : options.map((country, index) => {
              const selected = selection.countries.some(item => item.code === country.code);
              return (
                <button
                  type="button"
                  id={`country-option-${index}`}
                  key={country.code}
                  role="option"
                  aria-selected={selected}
                  disabled={plural && selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(country)}
                  style={{ width: '100%', minHeight: 50, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12, border: 0, borderBottom: '1px solid rgba(255,255,255,.05)', cursor: plural && selected ? 'default' : 'pointer', background: index === activeIndex ? 'rgba(245,158,11,.14)' : 'transparent', color: DUSK.textPrimary, fontFamily: 'inherit', textAlign: 'left', opacity: plural && selected ? .52 : 1 }}
                >
                  <span aria-hidden="true" style={{ fontSize: 23 }}>{country.flag}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{country.name}</span>
                  <span style={{ color: selected ? ACCENT : 'rgba(218,207,255,.3)', fontSize: 11, fontWeight: 700 }}>{selected ? '✓ Selected' : country.code}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <FieldError id="destinations-error" message={error} />

      <div aria-label="Interactive country globe" style={{ borderRadius: 20, overflow: 'hidden', marginBottom: 20, background: '#08021A', border: '1px solid rgba(138,94,220,.22)', boxShadow: '0 16px 44px rgba(0,0,0,.3), inset 0 1px rgba(255,255,255,.04)' }}>
        <CountryGlobe countries={selection.countries} activeCountryCode={selection.activeCountryCode} />
      </div>

      <section aria-labelledby="selected-countries-label" style={{ marginBottom: 20 }}>
        <Label id="selected-countries-label">{plural ? 'Your countries' : 'Selected country'}</Label>
        {selection.countries.length === 0 ? (
          <div style={{ minHeight: 58, borderRadius: 17, padding: '0 16px', display: 'flex', alignItems: 'center', border: '1px dashed rgba(255,255,255,.14)', color: 'rgba(218,207,255,.35)', fontSize: 13 }}>No country selected yet</div>
        ) : selection.countries.map((country, index) => (
          <div key={country.code} style={{ minHeight: 58, marginTop: index ? 8 : 0, borderRadius: 17, padding: '7px 9px 7px 14px', display: 'flex', alignItems: 'center', gap: 11, background: 'linear-gradient(110deg, rgba(245,158,11,.12), rgba(96,50,190,.1))', border: `1px solid ${selection.activeCountryCode === country.code ? `${ACCENT}78` : 'rgba(255,255,255,.09)'}` }}>
            {plural && <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.07)', color: 'rgba(218,207,255,.52)', fontSize: 11, fontWeight: 800 }}>{index + 1}</span>}
            <span aria-hidden="true" style={{ fontSize: 25 }}>{country.flag}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', color: 'rgba(255,255,255,.92)', fontSize: 14 }}>{country.name}</strong>
              <span style={{ display: 'block', marginTop: 2, color: 'rgba(218,207,255,.36)', fontSize: 10 }}>{country.code} · {plural ? `Stop ${index + 1}` : 'Trip country'}</span>
            </span>
            {plural ? (
              <button type="button" aria-label={`Remove ${country.name}, country ${index + 1}`} onClick={() => setSelection(previous => removeCountry(previous, country.code))} style={{ width: 44, height: 44, border: 0, borderRadius: 13, background: 'transparent', color: 'rgba(255,255,255,.5)', fontSize: 19, cursor: 'pointer' }}>×</button>
            ) : (
              <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); setShowDrop(true); }} style={{ minHeight: 44, padding: '0 10px', border: 0, background: 'transparent', color: ACCENT, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Change</button>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="popular-countries-label" style={{ marginBottom: 22 }}>
        <Label id="popular-countries-label">Popular countries</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9 }}>
          {popular.map(country => {
            const selected = selection.countries.some(item => item.code === country.code);
            return (
              <button key={country.code} type="button" aria-pressed={selected} onClick={() => choose(country)} style={{ minHeight: 48, borderRadius: 16, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, background: selected ? `${ACCENT}18` : 'rgba(255,255,255,.045)', border: `1px solid ${selected ? `${ACCENT}92` : 'rgba(255,255,255,.09)'}`, fontSize: 13, fontWeight: 600, color: selected ? DUSK.textPrimary : 'rgba(255,255,255,.7)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', textAlign: 'left' }}>
                <span aria-hidden="true" style={{ fontSize: 21 }}>{country.flag}</span><span style={{ flex: 1 }}>{country.name}</span>{selected && <span aria-hidden="true" style={{ color: ACCENT }}>✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <ContinueBtn disabled={selection.countries.length === 0} onClick={validate} />
      {selection.countries.length === 0 && <p style={{ margin: '9px 0 0', textAlign: 'center', color: 'rgba(218,207,255,.34)', fontSize: 11 }}>Select a country to continue.</p>}
      <button
        type="button"
        onClick={() => {
          if (!plural) setSelection(previous => enableMultiCountry(previous));
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        style={{ width: '100%', minHeight: 48, marginTop: 8, marginBottom: 'max(4px, env(safe-area-inset-bottom))', border: 0, background: 'transparent', color: 'rgba(231,222,255,.58)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        + Add another country
      </button>
    </Shell>
  );
}
