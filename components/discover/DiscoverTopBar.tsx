'use client'

import { ChevronDown, Search } from 'lucide-react'
import type { CountryOption } from '@/lib/trip-country-selection'
import styles from './DiscoverTopBar.module.css'

export interface DiscoverTopBarProps {
  country: CountryOption | null
  /** Opens the country picker. Both controls lead there while search is country-scoped. */
  onOpenCountryPicker: () => void
}

/** Floating controls over the Discover canvas: which country is framed, and how to change it. */
export function DiscoverTopBar({ country, onOpenCountryPicker }: DiscoverTopBarProps) {
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.countryPill}
        onClick={onOpenCountryPicker}
        aria-label={country ? `Exploring ${country.name}. Change country.` : 'Choose a country to explore'}
      >
        <span className={styles.flag} aria-hidden="true">{country?.flag ?? '🌍'}</span>
        <span className={styles.countryName}>{country?.name ?? 'Choose a country'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        className={styles.searchButton}
        onClick={onOpenCountryPicker}
        aria-label="Search countries"
      >
        <Search size={19} aria-hidden="true" />
      </button>
    </div>
  )
}
