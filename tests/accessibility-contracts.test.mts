import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

// Reads every .ts/.tsx file under a directory tree and concatenates it. Used
// where the contract belongs to a *feature* (e.g. the trip-creation wizard)
// rather than one specific file, so the assertion survives a refactor that
// moves the markup to a different file within that feature.
function readFeature(dir: string): string {
  let content = ''
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) content += readFeature(full)
    else if (/\.tsx?$/.test(entry)) content += readFileSync(full, 'utf8') + '\n'
  }
  return content
}

// Returns the body of a top-level `function <name>(` declaration, up to the next
// top-level declaration. Used where a contract is "this screen has exactly one X"
// and counting across the whole file would pick up unrelated screens.
function readTopLevelFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `expected a top-level function ${name}`)
  const end = source.indexOf('\nfunction ', start + 1)
  return end < 0 ? source.slice(start) : source.slice(start, end)
}

/** Drops `//` and block comments so a user-copy assertion can't be tripped by prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('auth fields keep explicit labels, named password toggles, and associated errors', () => {
  const login = read('app/(auth)/login/page.tsx')
  const signup = read('app/(auth)/sign-up/page.tsx')

  for (const id of ['login-username', 'login-password']) {
    assert.match(login, new RegExp(`htmlFor="${id}"`))
    assert.match(login, new RegExp(`id="${id}"`))
  }
  for (const id of ['signup-username', 'signup-password']) {
    assert.match(signup, new RegExp(`id="${id}"`))
  }
  assert.match(login, /aria-label=\{showPass \? 'Hide password' : 'Show password'\}/)
  assert.match(signup, /aria-label=\{showPass \? 'Hide password' : 'Show password'\}/)
  assert.match(login, /id="login-error" role="alert"/)
  assert.match(signup, /id="signup-error" role="alert"/)
})

test('trip country autocomplete exposes the keyboard listbox contract', () => {
  const wizard = readFeature('app/trips/new') + readFeature('components/trips/new')

  assert.match(wizard, /role="combobox"/)
  assert.match(wizard, /aria-controls="country-options"/)
  assert.match(wizard, /role="listbox"/)
  assert.match(wizard, /role="option"/)
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
    assert.match(wizard, new RegExp(`e\\.key === '${key}'`))
  }
  assert.doesNotMatch(wizard, /<div key=\{c\.name\} onMouseDown=\{\(\) => add\(c\)\}/)
})

test('focus and custom modal contracts remain present', () => {
  const css = read('app/globals.css')
  const confirm = read('components/ui/confirm-dialog.tsx')
  const destination = read('app/trip/[id]/mobile/DestinationDialog.tsx')
  const journal = read('app/trip/[id]/mobile/JournalDomain.tsx')

  assert.match(css, /:focus-visible/)
  assert.match(css, /outline: 3px solid #f5a623 !important/)
  assert.match(confirm, /previouslyFocused\?\.focus\?\.\(\)/)
  assert.match(destination, /returnFocus\?\.focus\?\.\(\)/)
  assert.match(journal, /lightboxTriggerRef\.current\?\.focus\?\.\(\)/)
})

test('packing and budget row actions keep mobile-sized hit targets', () => {
  const packing = read('app/trip/[id]/mobile/prep/PackingSection.tsx')
  const prepTasks = read('app/trip/[id]/mobile/prep/TaskSection.tsx')
  // Item delete lives in the prep detail sheet (tap row -> detail -> delete),
  // mirroring the expense detail sheet contract below.
  const prepSheets = read('app/trip/[id]/mobile/prep/PrepSheets.tsx')
  const budgetDetail = read('app/trip/[id]/mobile/budget/ExpenseDetailSheet.tsx')

  assert.match(packing, /aria-label=\{item\.checked \? `Uncheck \$\{item\.label\}` : `Check \$\{item\.label\}`\}[\s\S]*?width: 44, height: 44/)
  assert.match(packing, /aria-label=\{`Open details for \$\{item\.label\}`\}[\s\S]*?minHeight: 44/)
  assert.match(packing, /aria-label=\{`Reorder \$\{item\.label\}`\}[\s\S]*?width: 44, height: 44/)
  assert.match(prepTasks, /aria-label=\{task\.done \? `Mark \$\{task\.title\} not done` : `Mark \$\{task\.title\} done`\}[\s\S]*?width: 44, height: 44/)
  assert.match(prepSheets, /\{confirmDelete \? 'Tap again to delete' : 'Delete'\}/)
  assert.match(prepSheets, /aria-label="Decrease quantity"[\s\S]*?width: 44, height: 44/)
  assert.match(budgetDetail, /onClick=\{\(\) => onDelete\(expense\)\}[\s\S]*?minHeight: 44/)
})

test('plan sheet handle is an operable, labelled control and not a bare drag surface', () => {
  const plan = read('app/trip/[id]/mobile/PlanRouteDomain.tsx')

  // Pointer drag, tap, and keyboard activation all go through one <button>.
  assert.match(plan, /aria-label=\{snapLevel === 'max' \? 'Collapse plan' : 'Expand plan'\}/)
  assert.match(plan, /aria-expanded=\{snapLevel !== 'min'\}/)
  assert.match(plan, /onClick=\{handleHandleClick\}[\s\S]*?minHeight: 44/)
  // A drag must not also fire the tap cycle.
  assert.match(plan, /if \(dragMoved\.current\)[\s\S]*?return/)
  // Snap animation still collapses to zero duration under reduced motion.
  assert.match(plan, /reducedMotion \? \{ duration: 0 \}/)
})

test('plan tabs expose exactly one primary action and a recoverable route error', () => {
  const plan = read('app/trip/[id]/mobile/PlanRouteDomain.tsx')

  // One sticky CTA whose label follows the active tab, editors only.
  assert.match(plan, /\{activeTab === 'route' \? 'Add destination' : 'Add activity'\}/)
  assert.doesNotMatch(plan, /aria-label="Add to trip"/)
  // Retry re-runs the existing route effect instead of calling Directions directly.
  assert.match(plan, /Route unavailable[\s\S]*?setRouteRetryToken\(\(token\) => token \+ 1\)/)
  assert.match(plan, /\}, \[routeKey, routeRetryToken\]\)/)
  // Optimize stays hidden unless it can actually run.
  assert.match(plan, /canEdit && isOnline && stops\.length >= 2/)
})

test('the onboarding restart shortcut never reaches production', () => {
  const entry = read('components/onboarding/mobile-entry-flow.tsx')

  // The dev-only reset is the single caller that clears the onboarding key from
  // the UI; behind a NODE_ENV gate it cannot render for real users.
  assert.match(entry, /process\.env\.NODE_ENV === 'development' && \([\s\S]*?removeItem\(ONBOARDING_STORAGE_KEY\)/)
  const unguarded = stripComments(entry)
    .split(/process\.env\.NODE_ENV === 'development'/)[0]
  assert.doesNotMatch(unguarded, /removeItem\(ONBOARDING_STORAGE_KEY\)/)
})

test('the More sheet exposes labelled groups and a named row per destination', () => {
  const more = read('app/trip/[id]/mobile/components/TripMoreSheet.tsx')

  // Two <section>s, each named by its own visible heading.
  assert.match(more, /<section aria-labelledby="trip-more-essentials-heading">/)
  assert.match(more, /id="trip-more-essentials-heading"[\s\S]*?Trip essentials/)
  assert.match(more, /<section aria-labelledby="trip-more-manage-heading"/)
  assert.match(more, /id="trip-more-manage-heading"[\s\S]*?Manage &amp; share/)

  for (const label of ['Budget', 'Packing', 'Journal', 'Members', 'Activity', 'Export', 'Offline access']) {
    assert.match(more, new RegExp(`<SheetOptionRow[^>]*label="${label}"`))
  }
  // The dead "Soon" row is gone; every remaining row is available.
  assert.doesNotMatch(more, /label="Trip settings"/)
  assert.doesNotMatch(more, /available=\{false\}/)
})

test('the trip primary nav marks its active section with aria-current', () => {
  const nav = read('app/trip/[id]/mobile/components/TripPrimaryNav.tsx')

  assert.match(nav, /aria-current=\{isActive \? 'page' : undefined\}/)
  assert.match(nav, /aria-label="Trip sections"/)
  // Tab bar entries stay at or above the 44px touch floor.
  assert.match(nav, /minHeight: 48/)
})

test('active Overview keeps exactly one primary amber action', () => {
  const overview = read('app/trip/[id]/mobile/TripOverviewDomain.tsx')
  const active = readTopLevelFunction(overview, 'ActiveContent')

  const primaries = active.match(/<PrimaryButton\b/g) ?? []
  assert.equal(primaries.length, 1, 'active Overview must have one primary CTA')
  assert.match(active, /<PrimaryButton onClick=\{onTravelMode\}>Open Travel Mode<\/PrimaryButton>/)
  // The old amber "Navigate to …" deep link is gone; secondary actions are ghosts.
  assert.doesNotMatch(active, /ACCENT_GRADIENT/)
  assert.match(active, /<GhostButton onClick=\{onViewPlan\}>View day<\/GhostButton>/)
})

test('user-facing trip copy never names a migration number', () => {
  const mobile = stripComments(readFeature('app/trip/[id]/mobile'))

  assert.doesNotMatch(mobile, /migration \d/i)
  assert.doesNotMatch(mobile, /is coming soon\./)
})

test('the offline flow renders one owned sheet instead of a stacked pair', () => {
  const shell = read('app/trip/[id]/mobile/TripMobileClient.tsx')
  const more = read('app/trip/[id]/mobile/components/TripMoreSheet.tsx')
  const overview = read('app/trip/[id]/mobile/TripOverviewDomain.tsx')

  // The shell owns the only instance; both entry points ask it to open.
  assert.equal((shell.match(/<OfflineAccessSheet\b/g) ?? []).length, 1)
  assert.match(shell, /open=\{isOfflineSheetOpen\}/)
  assert.doesNotMatch(more, /OfflineAccessSheet/)
  // More closes itself before handing off, so the two never render together.
  assert.match(more, /label="Offline access"[\s\S]*?onSelect=\{\(\) => \{ onClose\(\); onOpenOffline\(\) \}\}/)
  assert.match(overview, /title="Offline access"[\s\S]*?onSelect=\{onOpenOffline\}/)
  // Members/Activity keep the same one-sheet-at-a-time guard.
  assert.match(more, /open=\{open && !membersOpen && !activityOpen\}/)
})
