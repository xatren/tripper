'use client'

import { useState } from 'react'
import { tokens } from '@/components/mobile'

export interface ExploreSearchInputProps {
  value: string
  onChange: (value: string) => void
  onCompositionChange: (composing: boolean) => void
  placeholder?: string
}

export function ExploreSearchInput({ value, onChange, onCompositionChange, placeholder = 'Search restaurants, museums, hotels…' }: ExploreSearchInputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor="google-place-search" className="sr-only">Search for a place</label>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: tokens.textMuted }}>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
      </svg>
      <input
        id="google-place-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => onCompositionChange(true)}
        onCompositionEnd={(event) => { onCompositionChange(false); onChange(event.currentTarget.value) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        style={{ width: '100%', minHeight: 48, padding: '0 48px 0 42px', boxSizing: 'border-box', borderRadius: tokens.radius16, border: `1px solid ${focused ? tokens.accent : 'rgba(255,255,255,.14)'}`, background: 'rgba(255,255,255,.07)', color: tokens.textPrimary, fontFamily: 'inherit', fontSize: 15, outline: 'none' }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" style={{ position: 'absolute', right: 5, top: 2, width: 44, height: 44, border: 0, background: 'transparent', color: tokens.textSecondary, cursor: 'pointer', fontSize: 20 }}>×</button>
      )}
    </div>
  )
}

