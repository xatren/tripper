'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet'
import { searchCountries, type CountryOption } from '@/lib/trip-country-selection'
import styles from './CountryPicker.module.css'

export interface CountryPickerSheetProps {
  open: boolean
  onClose: () => void
  options: CountryOption[]
  selectedCode: string | null
  /** Countries drawn from the user's own trips, offered first so the common case is one tap. */
  suggested: CountryOption[]
  onSelect: (country: CountryOption) => void
}

/**
 * Single-select country picker for Discover. Reuses the wizard's country data
 * and search, but none of its state: the wizard owns a multi-country selection
 * draft that is cleared on completion, while this picks exactly one country and
 * hands it straight back to the caller.
 */
export function CountryPickerSheet({ open, onClose, options, selectedCode, suggested, onSelect }: CountryPickerSheetProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    // The sheet takes focus itself on open; hand it to the field one frame later.
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  const results = useMemo(() => (query.trim() ? searchCountries(options, query) : options), [options, query])
  const searching = query.trim().length > 0

  const choose = (country: CountryOption) => {
    onSelect(country)
    onClose()
  }

  return (
    <MobileBottomSheet open={open} onClose={onClose} title="Explore a country">
      <div className={styles.searchRow}>
        <input
          ref={inputRef}
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          role="combobox"
          aria-label="Search countries"
          aria-autocomplete="list"
          aria-controls="discover-country-options"
          aria-expanded={searching}
          placeholder="Search countries…"
        />
      </div>

      {!searching && suggested.length > 0 && (
        <>
          <p className={styles.groupLabel} id="discover-country-suggested-label">From your trips</p>
          <div className={styles.suggestions} role="group" aria-labelledby="discover-country-suggested-label">
            {suggested.map((country) => (
              <button
                key={country.code}
                type="button"
                className={styles.suggestion}
                aria-pressed={country.code === selectedCode}
                onClick={() => choose(country)}
              >
                <span aria-hidden="true">{country.flag}</span>
                {country.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.results} id="discover-country-options" role="listbox" aria-label="Countries">
        {results.length === 0 ? (
          <p className={styles.empty} role="status">No countries match “{query}”.</p>
        ) : results.map((country) => {
          const selected = country.code === selectedCode
          return (
            <button
              key={country.code}
              type="button"
              role="option"
              aria-selected={selected}
              className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
              onClick={() => choose(country)}
            >
              <span className={styles.flag} aria-hidden="true">{country.flag}</span>
              <span className={styles.name}>{country.name}</span>
              <span className={styles.code}>{selected ? 'Exploring' : country.code}</span>
            </button>
          )
        })}
      </div>
    </MobileBottomSheet>
  )
}
