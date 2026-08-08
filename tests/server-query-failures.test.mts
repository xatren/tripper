import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { requiredQueryData, retryTransientQueryOnce } from '../lib/supabase/server-errors.ts'

const read = (path: string) => readFileSync(path, 'utf8')

test('required query failures never become valid empty collections', () => {
  const diagnostics: unknown[] = []
  const original = console.error
  console.error = (...args: unknown[]) => { diagnostics.push(args) }

  try {
    for (const operation of ['profiles.select', 'trips.select', 'stops.select', 'trip_members.select', 'expenses.select', 'journal_entries.select']) {
      assert.throws(
        () => requiredQueryData(
          { route: '/failure-simulation', operation },
          { data: [], error: { code: 'SIMULATED_FAILURE', status: 503 } },
        ),
        /Required application data could not be loaded/,
      )
    }
  } finally {
    console.error = original
  }

  assert.equal(diagnostics.length, 6)
})

test('genuine empty collections remain successful query data', () => {
  for (const operation of ['trips.select', 'stops.select', 'expenses.select', 'journal_entries.select']) {
    const empty: unknown[] = []
    assert.equal(
      requiredQueryData({ route: '/empty-simulation', operation }, { data: empty, error: null }),
      empty,
    )
  }
})

test('transient server queries retry once without masking persistent failures', async () => {
  let attempts = 0
  const recovered = await retryTransientQueryOnce(async () => {
    attempts += 1
    return attempts === 1
      ? { data: null, error: { code: '', status: null } }
      : { data: [{ trip_id: 'trip-1', role: 'owner' }], error: null }
  })

  assert.equal(attempts, 2)
  assert.deepEqual(recovered.data, [{ trip_id: 'trip-1', role: 'owner' }])

  attempts = 0
  const denied = await retryTransientQueryOnce(async () => {
    attempts += 1
    return { data: null, error: { code: '42501', status: 403 } }
  })

  assert.equal(attempts, 1)
  assert.equal(denied.error?.code, '42501')
})

test('protected pages check query results and trip access remains privacy-safe', () => {
  for (const path of ['app/dashboard/page.tsx', 'app/trips/page.tsx', 'app/explore/page.tsx', 'app/profile/page.tsx', 'app/settings/page.tsx']) {
    const source = read(path)
    assert.match(source, /requiredQueryData/)
    assert.doesNotMatch(source, /trips\s*\?\?\s*\[\]/)
  }

  const tripPage = read('app/trip/[id]/mobile/page.tsx')
  assert.match(tripPage, /if \(tripError\) throwServerDataError/)
  assert.match(tripPage, /if \(!trip\) notFound\(\)/)
  assert.match(tripPage, /operation: 'trip_members\.select'/)
  assert.match(tripPage, /if \(!currentMembership\) notFound\(\)/)
  assert.match(tripPage, /operation: 'stops\.select'/)
  assert.match(tripPage, /optionalQueryData/)
})

test('deferred expense and journal failures expose retry without empty-state copy', () => {
  const budget = read('app/trip/[id]/mobile/BudgetDomain.tsx')
  const journal = read('app/trip/[id]/mobile/JournalDomain.tsx')

  assert.match(budget, /error && !loading/)
  assert.match(budget, /title="Couldn't load expenses"/)
  assert.match(budget, /onRetry=\{onRetry\}/)
  assert.match(journal, /entriesError &&/)
  assert.match(journal, /title="Couldn't load the journal"/)
  assert.match(journal, /entries\?\.length === 0 && !entriesError/)
})

test('each protected route has reusable loading and retry boundaries', () => {
  const routes = ['dashboard', 'trips', 'explore', 'profile', 'settings', 'trip/[id]/mobile']
  for (const route of routes) {
    assert.match(read(`app/${route}/error.tsx`), /RouteError/)
  }
  // Every route keeps a loading boundary. Trips is the one exception to the shared
  // spinner: it owns a skeleton built from its real card geometry, so the list does
  // not jump on hydrate. It still announces itself as a live status region.
  for (const route of routes.filter((route) => route !== 'trips')) {
    assert.match(read(`app/${route}/loading.tsx`), /RouteLoading/)
  }
  assert.match(read('app/trips/loading.tsx'), /role="status"/)
  assert.match(read('components/route-state.tsx'), /reset\(\)/)
})
