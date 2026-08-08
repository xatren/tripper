'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Compass, Globe2, MapPinned } from 'lucide-react'
import type { Profile } from '@/types'
import { MAPBOX_TOKEN } from '@/lib/mapbox/client'
import { safeCoverImageUrl } from '@/lib/media-url'
import { getCountryOptions, type CountryOption } from '@/lib/trip-country-selection'
import {
  DISCOVER_COUNTRY_STORAGE_KEY,
  countryByCode,
  firstTripCountry,
  preferStoredCountry,
  type DiscoverCountrySource,
  type DiscoverTripCandidate,
} from '@/lib/discover/discover-country'
import {
  DEFAULT_DISCOVER_CATEGORY,
  curatedCategories,
  discoverCategory,
  type DiscoverCategoryId,
} from '@/lib/discover/categories'
import { DISCOVER_PLACES, DISCOVER_SEEDED_COUNTRIES } from '@/lib/discover/discover-places.generated'
import { filterDiscoverPlaces, hasCuratedCoverage } from '@/lib/discover/discover-query'
import { AppBottomNav } from '@/components/ui/AppBottomNav'
import { CountryPickerSheet } from '@/components/discover/CountryPickerSheet'
import { DiscoverCategoryRail } from '@/components/discover/DiscoverCategoryRail'
import { DiscoverTopBar } from '@/components/discover/DiscoverTopBar'
import styles from './Discover.module.css'

export interface DiscoverClientProps {
  profile: Profile | null
  trips: DiscoverTripCandidate[]
  /** Server-resolved country, already through the param → featured-trip → recent-trip precedence. */
  initialCountryCode: string | null
  initialCountrySource: DiscoverCountrySource
  /** Server-resolved `?cat=`, already defaulted for unknown values. */
  initialCategory: DiscoverCategoryId
}

/** Height of the static Phase 2 sheet; the draggable three-level sheet lands in Phase 3. */
const SHEET_HEIGHT = 288
/** Clearance for the floating AppBottomNav, matching Map Home. */
const NAV_CLEARANCE = 92

function MapFallback({ message }: { message: string }) {
  return (
    <div className={styles.mapFallback} role="status">
      <MapPinned size={25} aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}

export function DiscoverClient({
  profile,
  trips,
  initialCountryCode,
  initialCountrySource,
  initialCategory,
}: DiscoverClientProps) {
  const router = useRouter()
  const options = useMemo(() => getCountryOptions(), [])

  const [MapComponent, setMapComponent] = useState<typeof import('@/components/discover/DiscoverMap').DiscoverMap | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [online, setOnline] = useState(true)
  const [viewportHeight, setViewportHeight] = useState(800)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [countryCode, setCountryCode] = useState<string | null>(initialCountryCode)
  const [category, setCategory] = useState<DiscoverCategoryId>(initialCategory)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)

  const listRef = useRef<HTMLUListElement | null>(null)
  const country = useMemo(() => countryByCode(countryCode, options), [countryCode, options])

  // Countries the user already travels to, offered as one-tap picks.
  const suggested = useMemo(() => {
    const seen = new Map<string, CountryOption>()
    for (const trip of trips) {
      const first = firstTripCountry(trip, options)
      if (first && !seen.has(first.code)) seen.set(first.code, first)
    }
    return [...seen.values()].slice(0, 6)
  }, [options, trips])

  const places = useMemo(
    () => filterDiscoverPlaces(DISCOVER_PLACES, { countryCode: country?.code ?? null, categoryId: category }),
    [category, country],
  )

  // One pass over the dataset per country rather than one per chip.
  const counts = useMemo(() => {
    const tally: Partial<Record<DiscoverCategoryId, number>> = {}
    for (const item of curatedCategories()) tally[item.id] = 0
    if (!country) return tally
    for (const place of DISCOVER_PLACES) {
      if (place.countryCode !== country.code) continue
      for (const id of place.categories) if (id in tally) tally[id] = (tally[id] ?? 0) + 1
    }
    return tally
  }, [country])

  const countryIsMapped = hasCuratedCoverage(country?.code, DISCOVER_SEEDED_COUNTRIES)

  useEffect(() => {
    let current = true
    import('@/components/discover/DiscoverMap')
      .then((module) => { if (current) setMapComponent(() => module.DiscoverMap) })
      .catch(() => { if (current) setMapFailed(true) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    const updateHeight = () => setViewportHeight(window.innerHeight)
    updateOnline(); updateHeight()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    window.addEventListener('resize', updateHeight)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  // localStorage is the second precedence step but is unreadable on the server,
  // so it is reconciled once after mount. A `?country=` deep link outranks it and
  // is left alone by preferStoredCountry.
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(DISCOVER_COUNTRY_STORAGE_KEY)
    } catch {
      // Private-mode storage denial is not a reason to lose the server resolution.
      return
    }
    const preferred = preferStoredCountry(
      { country: countryByCode(initialCountryCode, options), source: initialCountrySource },
      stored,
      options,
    )
    if (preferred.country && preferred.country.code !== initialCountryCode) setCountryCode(preferred.country.code)
    // Runs once against the server resolution; later changes go through chooseCountry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The URL carries country and category together: writing one without the other
  // would silently drop the user's other choice from a shared or reloaded link.
  const writeUrl = useCallback((nextCountry: string | null, nextCategory: DiscoverCategoryId) => {
    const params = new URLSearchParams()
    if (nextCountry) params.set('country', nextCountry)
    if (nextCategory !== DEFAULT_DISCOVER_CATEGORY) params.set('cat', nextCategory)
    const query = params.toString()
    router.replace(query ? `/explore?${query}` : '/explore', { scroll: false })
  }, [router])

  const chooseCountry = useCallback((next: CountryOption) => {
    setCountryCode(next.code)
    setSelectedPlaceId(null)
    try {
      window.localStorage.setItem(DISCOVER_COUNTRY_STORAGE_KEY, next.code)
    } catch {
      // The URL still carries the choice, so a storage failure only costs persistence.
    }
    // One value, two durable homes: the URL makes it shareable and back-navigable.
    writeUrl(next.code, category)
  }, [category, writeUrl])

  const chooseCategory = useCallback((next: DiscoverCategoryId) => {
    setCategory(next)
    // A place selected on the old layer is not on the new one.
    setSelectedPlaceId(null)
    writeUrl(countryCode, next)
  }, [countryCode, writeUrl])

  // A marker tap has to bring its row into view; a row tap already is in view.
  const selectFromMap = useCallback((id: string | null) => {
    setSelectedPlaceId(id)
    if (!id) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(id)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [])

  const mapUnavailable = !MAPBOX_TOKEN || !online || mapFailed
  const fallbackMessage = !MAPBOX_TOKEN
    ? 'Map unavailable · you can still browse the list'
    : !online ? 'You are offline · the map will return when you reconnect' : 'The map could not load · try again in a moment'

  const fitPadding = {
    top: 104,
    right: 40,
    bottom: Math.min(viewportHeight - 150, SHEET_HEIGHT + NAV_CLEARANCE + 18),
    left: 34,
  }

  const activeLabel = discoverCategory(category).label

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Discover destinations</h1>

      <section
        className={styles.mapLayer}
        role="region"
        aria-label={country ? `${country.name} discovery map` : 'World discovery map'}
      >
        {mapUnavailable ? <MapFallback message={fallbackMessage} /> : MapComponent ? (
          <MapComponent
            country={country}
            fitPadding={fitPadding}
            places={places}
            category={category}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={selectFromMap}
            onMapError={() => setMapFailed(true)}
          />
        ) : <MapFallback message="Opening the map…" />}
      </section>

      <div className={styles.topScrim} aria-hidden="true" />
      <div className={styles.bottomScrim} aria-hidden="true" />

      <DiscoverTopBar country={country} onOpenCountryPicker={() => setPickerOpen(true)} />

      <section className={styles.sheet} aria-label="Discover results" style={{ height: SHEET_HEIGHT }}>
        <DiscoverCategoryRail active={category} onChange={chooseCategory} counts={counts} />

        <p className={styles.resultCount} aria-live="polite">
          {country
            ? `${places.length} ${activeLabel.toLowerCase()} in ${country.name}`
            : 'Pick a country to start exploring'}
        </p>

        <div id="discover-results" className={styles.results}>
          {places.length > 0 ? (
            <ul className={styles.list} ref={listRef}>
              {places.map((place) => {
                const image = safeCoverImageUrl(place.imageUrl)
                const isSelected = place.id === selectedPlaceId
                return (
                  <li key={place.id} data-place-id={place.id}>
                    <button
                      type="button"
                      className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedPlaceId(isSelected ? null : place.id)}
                    >
                      {image ? (
                        // Commons thumbnails are already width-capped by the
                        // seeder's Special:FilePath query, and next/image would
                        // proxy every one of them through our own optimizer.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.thumb} src={image} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className={styles.thumbFallback} aria-hidden="true" />
                      )}
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{place.name}</span>
                        <span className={styles.rowMeta}>{place.region ?? place.blurb ?? country?.name}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={styles.empty}>
              {!country
                ? 'Choose a country and its best places will appear here.'
                : countryIsMapped
                  // "Nothing in this layer" and "nothing anywhere" are different
                  // failures and must not share one message (§15 cases 1–2).
                  ? `No ${activeLabel.toLowerCase()} mapped in ${country.name} yet. Try another category.`
                  : `We haven't mapped ${country.name} yet — it's coming as the curated set grows.`}
            </p>
          )}
        </div>

        <div className={styles.credit}>
          <button
            type="button"
            className={country ? styles.creditAction : styles.creditActionPrimary}
            onClick={() => setPickerOpen(true)}
          >
            {country ? <Compass size={13} aria-hidden="true" /> : <Globe2 size={13} aria-hidden="true" />}
            {country ? 'Change country' : 'Choose a country'}
          </button>
          {/* ODbL/Commons attribution obligation (§18.3). Per-file credit lands on
              the detail sheet in Phase 3; this covers the list. */}
          <span className={styles.creditText}>Places from Wikidata · photos from Wikimedia Commons</span>
        </div>
      </section>

      <AppBottomNav active="explore" profile={profile} floating />

      <CountryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        options={options}
        selectedCode={country?.code ?? null}
        suggested={suggested}
        onSelect={chooseCountry}
      />
    </main>
  )
}
