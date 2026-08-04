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
