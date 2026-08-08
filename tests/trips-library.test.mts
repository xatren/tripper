import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/trips/page.tsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../app/trips/TripsClient.tsx', import.meta.url), 'utf8')
const helper = readFileSync(new URL('../app/trips/trips-library.ts', import.meta.url), 'utf8')
const loading = readFileSync(new URL('../app/trips/loading.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/trips/Trips.module.css', import.meta.url), 'utf8')

test('Trips projects the featured route into a decorative backdrop', () => {
  assert.match(page, /from\('stops'\)\.select\('\*'\)\.order\('order_index'/)
  assert.match(page, /<TripsClient[^>]+stops=\{stops\}/)
  assert.match(client, /selectFeaturedTrip\(trips\)/)
  assert.match(client, /<TripsMapBackdrop trip=\{featuredTrip\} stops=\{stops\}/)
  // The shape still comes from the featured trip's own stops, not a generic ornament.
  // The projection itself now lives in the helper, so this contract spans two files.
  assert.match(helper, /stop\.trip_id === tripId && Number\.isFinite\(stop\.lat\) && Number\.isFinite\(stop\.lng\)/)
  assert.match(client, /projectStopMarks\(stops, trip\?\.id \?\? null\)/)
  assert.match(client, /<polyline points=\{marks\.map/)
  assert.match(client, /className=\{styles\.fallbackPin\}/)
})

test('the Trips backdrop stays free of map runtime and paid route requests', () => {
  // It is aria-hidden and blurred behind the list, so mounting Mapbox GL or calling
  // the Directions API here would be pure cost. Map Home owns the interactive map.
  assert.match(client, /aria-hidden="true" inert/)
  assert.doesNotMatch(client, /<TripboxMap/)
  assert.doesNotMatch(client, /getFullRoute/)
  assert.doesNotMatch(client, /LatestRouteRequestController/)
  assert.doesNotMatch(client, /MAPBOX_TOKEN/)
})

test('Trips owns a visible create flow in both populated and empty states', () => {
  const newTripRoutes = client.match(/router\.push\('\/trips\/new'\)/g) ?? []
  assert.ok(newTripRoutes.length >= 2)
  assert.match(client, />New trip</)
  assert.match(client, />Create new trip</)
  assert.doesNotMatch(client, /onNewTrip=\{\(\) => router\.push\('\/dashboard'\)\}/)
})

test('trip management remains capability-gated and cleans private storage before deletion', () => {
  assert.match(client, /if \(!capabilitiesByTripId\[tripId\]\?\.canManageTrip\) return/)
  const cleanup = client.indexOf('removeTripStorageObjects(supabase, tripId)')
  const deletion = client.indexOf("from('trips').delete().eq('id', tripId)")
  assert.ok(cleanup >= 0 && deletion > cleanup)
  assert.match(client, /capabilities\?\.canManageTrip &&/)
})

test('lifecycle logic lives in the helper and delegates to the map-home vocabulary', () => {
  assert.match(client, /from '\.\/trips-library\.ts'/)
  assert.match(helper, /from '\.\.\/\.\.\/lib\/map-home\.ts'/)
  // No second date engine: the client no longer compares Date objects at all.
  assert.doesNotMatch(client, /function getStatus\(/)
  assert.doesNotMatch(client, /setHours\(0, 0, 0, 0\)/)
  assert.doesNotMatch(client, /startOfToday/)
  for (const source of [client, helper]) {
    assert.doesNotMatch(source, /'ongoing'/)
    assert.doesNotMatch(source, /'nodates'/)
  }
})

test('the card drops its dead rail, index numbers and stale subtitle', () => {
  assert.doesNotMatch(client, /styles\.cardRail/)
  assert.doesNotMatch(client, /styles\.role\b/)
  assert.doesNotMatch(client, /padStart\(2, '0'\)/)
  assert.doesNotMatch(client, /styles\.tripIndex/)
  assert.doesNotMatch(client + helper, /Your next route/)
  assert.doesNotMatch(client, /Every route, one place/)
  // Status now reaches CSS as data, and every card carries a cover or a seed tile.
  assert.match(client, /data-status=\{status\}/)
  assert.match(client, /loading="lazy"/)
  assert.match(client, /decoding="async"/)
  assert.match(client, /onError=\{\(\) => setCoverFailed\(true\)\}/)
})

test('trip cards lazily resolve a nearby route photo and preserve the seed fallback', () => {
  assert.match(client, /stopsByTripId\.get\(trip\.id\)/)
  assert.match(client, /selectTripPhotoStop\(stops\)/)
  assert.match(client, /IntersectionObserver/)
  assert.match(client, /\/api\/places\/search\?/)
  assert.match(client, /if \(cacheable\) autoPhotoCache\.set/)
  assert.match(client, /tripLandmarkSearchParams\(stop\)/)
  assert.match(client, /selectTripCoverPhoto/)
  assert.match(client, /\/api\/places\/photo\?ref=/)
  assert.match(client, /autoPhotoCache\.delete\(photoStop\.id\)/)
  assert.match(client, /styles\.thumbSeed/)
})

test('the loading route renders real card geometry instead of a generic spinner', () => {
  assert.doesNotMatch(loading, /RouteLoading/)
  assert.match(loading, /role="status"/)
  assert.match(loading, /Loading your trips/)
  assert.match(loading, /SkeletonBlock/)
  assert.match(css, /\.skeletonCard/)
})

test('Trips styling sits on the token layer with its accessibility guards intact', () => {
  assert.match(css, /var\(--gradient-accent-cta\)/)
  assert.match(css, /var\(--font-fraunces\)/)
  assert.match(css, /var\(--scrim-top\)/)
  assert.doesNotMatch(css, /#ffc766/)
  assert.doesNotMatch(css, /--amber/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(css, /@supports not \(\(backdrop-filter/)
  assert.match(css, /@media \(max-width: 370px\)/)
  assert.match(css, /@media \(max-height: 670px\)/)
})
