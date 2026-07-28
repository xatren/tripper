# Dusk Migration — Trip Page Handoff (post Faz 13)

## Context
Faz 1–13 of the Dusk Edition migration are complete (see `docs/dusk-migration-handoff.md` for
that history — Faz 10–13 covered `NewTripClient.tsx`, `TripSummaryHero.tsx`, shared UI
primitives, and `route-state.tsx`; Create Trip also got the actual visual redesign: `.atmosphere`
background on its `Shell` component, `ACCENT`→`DUSK.amber`, `BTN_GRAD`→`SUNSET_GRADIENT`).

This doc hands off the **trip detail page** (`app/trip/[id]/mobile/**`) sweep to a fresh
session/agent, done to avoid burning further budget in a session whose per-Edit "Fact-Forcing
Gate" hook (see below) makes every single edit expensive.

A full grep sweep of `app/trip/[id]/mobile/**` was already run and hand-verified line by line.
**Most hits were false positives** (already-migrated files using named tokens like
`ACCENT_LIGHT`/`ACCENT_DARK`/`ACCENT_GRADIENT`, or `border:` literals that are a **documented
exclusion**, not a miss). Only two real, small fixes remain. Do not re-run a broad exploratory
pass before starting — the list below is already the verified, filtered result.

## Token sources — two coexisting systems, do not cross them
- **Dusk tokens**: `@/components/design/tokens` → `DUSK`, `SUNSET_GRADIENT`, etc. (canonical:
  `components/onboarding/dusk/tokens.ts`).
- **Mobile "Liquid Glass" tokens**: `@/components/mobile` → `tokens` object (canonical:
  `components/mobile/tokens.ts`, values are `var(--color-*)` CSS variables from `app/globals.css`).
  Most files under `app/trip/[id]/mobile/**` already import `tokens` from `@/components/mobile`,
  **not** `DUSK`. When a file already imports `tokens`, migrate literals to `tokens.*` (e.g.
  `tokens.textPrimary`), not to a freshly-imported `DUSK.*` — stay consistent with what the file
  already uses. Only reach for `DUSK.*` in files that don't already have the mobile `tokens`
  system wired in (rare under this directory — check imports first).

## The two real remaining fixes

### 1. `app/trip/[id]/mobile/explore/AddToTripSheet.tsx`
Line 30 (inside a module-level `FIELD_STYLE` const, ~line 27-31):
```
const FIELD_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12,
  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
  color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
}
```
This file already imports `tokens` from `@/components/mobile` (see line 4: `import { tokens,
MobileBottomSheet, FilterChip } from '@/components/mobile'`). Change `color: '#fff'` to
`color: tokens.textPrimary`. Do **not** import DUSK here — `tokens.textPrimary` resolves to
`var(--color-text-primary)` = `#ffffff`, the correct equivalent already available.

### 2. Duplicate solid map-placeholder fill — two files, same literal
Both use an identical solid background fill behind a map/canvas element:
- `app/trip/[id]/mobile/PlanRouteDomain.tsx:500` —
  `<div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#06061c' }}>`
- `app/trip/[id]/mobile/TripMapDomain.tsx:106` —
  `<div style={{ position: 'absolute', inset: 0, background: '#06061c' }}>`

`#06061c` is one hex digit off from `DUSK.night` (`#060616`) — almost certainly the same intended
color, just typo'd/duplicated independently in both files at some point. Both files already
import `DUSK` (confirm with a quick grep before editing, since imports can drift — as of this
handoff both do). Recommendation: replace both with `DUSK.night`. Use judgment — if you'd rather
leave the byte-for-byte value untouched because you're not 100% sure they're meant to match,
that's a defensible call too; flag it to the user either way instead of silently picking one.

**Do NOT touch**, in the same directory, things that look similar but aren't in scope:
- `border: ... '1.5px solid rgba(215,215,255,.35)'` in `prep/PackingSection.tsx:183`,
  `prep/TaskSection.tsx:115`, `prep/PrepSheets.tsx:422` — these are `border:` properties, which
  are a **documented exclusion** from the very first Dusk handoff (no exact DUSK/tokens
  border-equivalent for this muted-purple hue; every migrated file so far has only ever touched
  `color:`/`background:`, never `border:`). Leave them exactly as they are.
- `ACCENT_LIGHT`/`ACCENT_DARK`/`ACCENT_GRADIENT` gradients in `DayOptimizePreviewSheet.tsx:146`,
  `PlanRouteDomain.tsx:626,841,991` — these already use named tokens from `domain-ui.tsx`
  (`export const ACCENT_GRADIENT = SUNSET_GRADIENT`), not raw literals. They only showed up in a
  naive `grep "linear-gradient(145deg"` sweep because of the angle substring match — nothing to
  migrate here.
- `TripMapDomain.tsx:12` — `radial-gradient(120% 90% at 50% 10%, #12123a 0%, #0a0a28 55%,
  #06061c 100%)` is a Suspense-fallback loading-skeleton gradient. It's intentionally identical to
  the fallback used in `components/journal/TripSummaryHero.tsx` (a shared, deliberate loading-state
  look) — not a legacy leftover. Leave it untouched.

## Verification loop
```bash
grep -n "#06061c" "app/trip/[id]/mobile/PlanRouteDomain.tsx" "app/trip/[id]/mobile/TripMapDomain.tsx"
grep -n "color: '#fff'" "app/trip/[id]/mobile/explore/AddToTripSheet.tsx"
```
Should show zero matches for the two fixed spots (the `TripMapDomain.tsx:12` radial-gradient's
`#06061c` stop is expected to remain — that one's an intentional exclusion, not a bug).

Then typecheck the three touched files:
```bash
npx tsc --noEmit -p . 2>&1 | grep -i "AddToTripSheet\|PlanRouteDomain\|TripMapDomain"
```
Should show no output.

## Fact-Forcing Gate note (this repo has a pre-Edit/pre-Bash hook — expect it)
A hook blocks every single `Edit` call (and the first `Bash` call of a session) until you present,
in plain text immediately before the tool call: (1) importers of the file (via Grep), (2) public
functions/classes affected, (3) data-file read/write details (N/A for these — UI-only), (4) a
verbatim quote of the user's current instruction. This fires on **every** Edit call, even
near-identical repeats in the same file — budget for that overhead when estimating this task's
cost, and batch as much of each file's changes into as few Edit calls as possible (one Edit per
file here, since each fix is a single line/spot).

If an Edit gets gate-blocked, it does NOT apply — the error is not silent, but always re-grep to
confirm a change landed before assuming success, especially if you send multiple edits in one
turn and one silently fails while another succeeds.

## After these two fixes
This closes out the `app/trip/[id]/mobile/**` sweep. Report completion to the user in Turkish
(they communicate in Turkish throughout — recent phrasing: "guzel calisiyor. Simdi trip sayfasina
gecelim"). No commit has been made for any Dusk-migration work across any phase — do not commit
unless the user explicitly asks. All changes remain in the working tree uncommitted.

If, after finishing these two fixes, the user wants the sweep to continue elsewhere, ask them
which surface next rather than assuming — the Dusk migration has touched nearly everything at
this point (Dashboard, Explore, Trips, Profile, Settings, auth, Create Trip, and essentially all
of `app/trip/[id]/mobile/**`), so there may not be much legacy surface left. A quick way to check
before diving in: `grep -rln "rgba(215,215,255\|color: '#fff'\|'#1a0800'" --include="*.tsx" app/
components/` filtered by eye for the same false-positive patterns seen here (border: literals,
named-token gradients, intentional shared loading-skeleton gradients) before treating a hit as
real work.
