import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('auth fields keep explicit labels, named password toggles, and associated errors', () => {
  const login = read('app/(auth)/login/page.tsx')
  const signup = read('app/(auth)/sign-up/page.tsx')

  for (const id of ['login-email', 'login-password']) {
    assert.match(login, new RegExp(`htmlFor="${id}"`))
    assert.match(login, new RegExp(`id="${id}"`))
  }
  for (const id of ['signup-name', 'signup-email', 'signup-password', 'signup-confirm-password']) {
    assert.match(signup, new RegExp(`id="${id}"`))
  }
  assert.match(login, /aria-label=\{showPass \? 'Hide password' : 'Show password'\}/)
  assert.match(signup, /aria-label=\{showConfirm \? 'Hide confirmation password' : 'Show confirmation password'\}/)
  assert.match(login, /id="login-error" role="alert"/)
  assert.match(signup, /id="signup-error" role="alert"/)
})

test('trip country autocomplete exposes the keyboard listbox contract', () => {
  const wizard = read('app/trips/new/NewTripClient.tsx')

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
  const packing = read('app/trip/[id]/mobile/PrepDomain.tsx')
  // Delete lives in the expense detail sheet (tap row -> detail -> edit/delete),
  // not inline in the category list — see app/trip/[id]/mobile/BudgetDomain.tsx.
  const budgetDetail = read('app/trip/[id]/mobile/budget/ExpenseDetailSheet.tsx')

  assert.match(packing, /aria-label=\{item\.checked \? `Uncheck \$\{item\.label\}` : `Check \$\{item\.label\}`\}[\s\S]*?width: 44, height: 44/)
  assert.match(packing, /aria-label=\{`Remove \$\{item\.label\}`\}[\s\S]*?width: 44, height: 44/)
  assert.match(budgetDetail, /onClick=\{\(\) => onDelete\(expense\)\}[\s\S]*?minHeight: 44/)
})
