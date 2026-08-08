import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Overview reuses the lifted route as a transparent Map Home backdrop', () => {
  const client = readFileSync(new URL('../app/trip/[id]/mobile/TripMobileClient.tsx', import.meta.url), 'utf8')
  const backdrop = readFileSync(new URL('../app/trip/[id]/mobile/components/OverviewRouteBackdrop.tsx', import.meta.url), 'utf8')
  const overviewCss = readFileSync(new URL('../app/trip/[id]/mobile/TripOverview.module.css', import.meta.url), 'utf8')

  assert.match(client, /visibleScreen === 'overview' && <OverviewRouteBackdrop[^>]+routePath=\{routePath\}/)
  assert.match(backdrop, /routePath=\{routePath\}/)
  assert.match(backdrop, /interactive=\{false\}/)
  assert.doesNotMatch(backdrop, /getFullRoute|LatestRouteRequestController/)
  assert.match(backdrop, /backdropFilter: 'blur\(6px\) saturate\(\.78\)'/)

  // The backdrop only reads through if Overview stays translucent above it:
  // an opaque hero or card fill would hide the route entirely.
  assert.match(overviewCss, /\.hero\s*\{[^}]*background:\s*transparent/)
  assert.match(overviewCss, /\.card\s*\{[^}]*background:\s*rgba\(10,\s*9,\s*31,\s*\.52\)/)
})
