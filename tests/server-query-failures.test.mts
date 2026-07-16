import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { requiredQueryData } from '../lib/supabase/server-errors.ts'

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
  for (const route of ['dashboard', 'trips', 'explore', 'profile', 'settings', 'trip/[id]/mobile']) {
    assert.match(read(`app/${route}/error.tsx`), /RouteError/)
    assert.match(read(`app/${route}/loading.tsx`), /RouteLoading/)
  }
  assert.match(read('components/route-state.tsx'), /unstable_retry\(\)/)
})
