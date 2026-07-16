# Mobile regression checklist

Manual QA checklist for Tripper's mobile-only surfaces. Run this before any release that touches layout, auth, or the trip workspace. Pair with [docs/current-mobile-baseline.md](docs/current-mobile-baseline.md) for the flows/components each item exercises.

Target viewports (test all four, in both light content and long content states):

- **320px** — smallest supported (iPhone SE / older Android)
- **375px** — iPhone standard
- **390px** — iPhone 12/13/14 class
- **430px** — iPhone Pro Max class, largest supported

---

## 1. Layout & safe area

- [ ] At each of the 4 viewports: no horizontal scroll/overflow on `/`, `/login`, `/sign-up`, `/dashboard`, `/trips`, `/trips/new`, `/explore`, `/trip/[id]/mobile` (all 4 tabs), `/profile`, `/settings`
- [ ] Bottom nav (`TripBottomNav`, `AppBottomNav`) respects `env(safe-area-inset-bottom)` on devices with a home indicator — content isn't clipped behind it
- [ ] Top content respects `env(safe-area-inset-top)` where a floating header overlaps the status bar (Plan tab's floating header over the map)
- [ ] Full-height screens use `100svh`/`100dvh` (not bare `100vh`) so the layout doesn't jump when the browser chrome shows/hides — check `/trip/[id]/mobile` in particular, since it has a draggable bottom sheet anchored to viewport height
- [ ] Minimum touch target is 44×44px on all interactive controls: bottom nav icons, FAB "Add destination", stop list row actions (rename/delete), packing item checkboxes, expense delete buttons, journal photo delete/lightbox controls

## 2. Virtual keyboard

- [ ] Opening the keyboard on `/login`/`/sign-up` doesn't hide the submit button or the error message below the fold
- [ ] New trip wizard (`NewTripClient.tsx`) text inputs remain visible/scrolled-into-view when the keyboard opens at each step
- [ ] Plan tab: renaming a stop (inline text input) — keyboard doesn't cover the input or the confirm action
- [ ] Prep tab: "add item" input stays visible above the keyboard; after a successful add, keyboard behavior (stays open vs. dismisses) is consistent
- [ ] Budget tab: add-expense form (amount/description/payer) is usable with the keyboard open — verify the payer picker isn't obscured
- [ ] Journal tab: entry composer (title/body + photo picker) remains usable with the keyboard open; test with the on-screen keyboard covering roughly half the viewport at 320px
- [ ] Closing the keyboard (tap outside / done) doesn't leave the bottom sheet or nav in a shifted position

## 3. Orientation

- [ ] Rotate to landscape on `/trip/[id]/mobile` Plan tab — map, bottom sheet, and floating header remain usable (this app is mobile-portrait-first; verify landscape at minimum doesn't break, even if not fully optimized)
- [ ] Rotate mid-interaction (e.g. while the optimize-preview sheet or a confirm dialog is open) — dialog stays anchored and dismissible
- [ ] Photo lightbox (Journal) in landscape — image scales, close control remains reachable

## 4. Reduced motion

- [ ] With OS-level "reduce motion" enabled, verify `components/motion/ReducedMotionProvider.tsx` suppresses/replaces framer-motion animations across: page transitions, bottom sheet drag/snap, toast enter/exit, optimize-preview sheet open/close
- [ ] Bottom sheet drag (Plan tab, native Pointer Events) still functions for interaction purposes even with animation duration reduced — dragging shouldn't become janky or unresponsive
- [ ] No animation-dependent content is ever the *only* way to reach a control (e.g. a button that only becomes clickable after an animation settles)

## 5. Offline / network-failure banner

- [ ] Simulate offline (devtools network throttling → offline) while on `/trip/[id]/mobile` — verify user gets a visible signal, not a silent stall
- [ ] Plan tab: with directions/optimize calls failing (offline or 5xx), confirm `routeLoading` does not spin forever with no failure indication — **known bug, see baseline doc §9 Plan** — verify whether a fix has landed or the checklist item should stay red
- [ ] Weather fetch failure in Days tab — confirm this is either fixed to show a distinguishable "couldn't load weather" state, or explicitly accepted as silent-by-design (don't let this regress further without a decision)
- [ ] Realtime subscription drop (kill network mid-session, restore) — confirm `stops`/`packing_items`/`expenses`/`journal_entries` reconcile back to server state rather than showing stale optimistic data indefinitely
- [ ] Retry buttons (`RetryCard`, `RouteError`) actually work — **known bug: `RouteError`'s `unstable_retry` prop is always `undefined`, so "Try again" throws on dashboard/trips/profile/settings.** Verify fixed or still broken each release.

## 6. Loading / error / empty states

For each of: Dashboard, Trips list, Plan, Prep, Budget, Journal —

- [ ] **Loading**: confirm a loading indicator actually appears on slow network (throttle to Slow 3G) rather than a blank flash
- [ ] **Error**: force a Supabase query failure (e.g. temporarily revoke network to Supabase, or use devtools request blocking on the relevant endpoint) and confirm an error state renders — not a silently empty list
- [ ] **Empty**: confirm the empty-state copy/CTA appears only when there's genuinely no data (not conflated with a load failure) — pay particular attention to **Budget's summary card**, which is known to render "$0 spent" during a load failure instead of an error state (baseline doc §9 Budget)
- [ ] New trip wizard: confirm behavior on RPC failure (`create_trip_with_stops`) — toast appears, form state is preserved so the user doesn't lose wizard input
- [ ] Join flow: confirm a failed invite code redirect (`/dashboard?error=invalid_invite`) — note this currently shows no message at all; verify intentional or flag as still-open

## 7. Viewer vs. editor role differences

Test as both an `editor`/`owner` member and a `viewer` member of the same trip:

- [ ] Plan tab: viewer cannot see the FAB, cannot open rename/delete on stop rows, Optimize button is hidden/disabled, nights stepper is read-only text instead of a control
- [ ] Prep tab: viewer cannot toggle/remove items, add-item input and seed-template button are hidden
- [ ] Budget tab: viewer cannot add/delete expenses; payer picker and amount/description inputs are hidden
- [ ] Journal tab: viewer cannot see the composer block or delete controls; can still view entries/photos and open the lightbox
- [ ] Attempt a direct mutation as a viewer via devtools (bypassing UI gating) and confirm the Supabase RLS policy rejects it server-side — UI gating is not the actual security boundary, so this must fail even if a button were somehow clicked
- [ ] Owner-only actions (manage members, delete trip) are reachable by an owner and not by an editor or viewer

## 8. Cross-viewport interaction sanity

- [ ] At 320px specifically: verify the Plan tab's bottom sheet snap points don't push content off-screen, and the stop list remains scrollable within the sheet without fighting the page scroll
- [ ] At 430px: verify content doesn't stretch awkwardly wide — check that text line lengths and card widths stay readable, per the mobile-only (not desktop) design intent
- [ ] Focus-visible outlines are present and visible (not suppressed) when navigating by keyboard/switch control at any viewport, on all primary actions (FAB, tab bar, form submit buttons)
- [ ] Screen reader labels: bottom nav icons, FAB, and icon-only buttons (delete/rename on stop rows, journal photo actions) all have accessible names — spot check with a screen reader or the accessibility tree in devtools
