# Dusk Token Migration — Handoff (Faz 10–13)

## Context
The app is mid-migration from hardcoded legacy color literals to the "Dusk Edition" design
token system. Faz 1–9 are complete and verified (zero remaining target literals, zero new
TypeScript errors). This doc hands off **Faz 10–13**, the remaining work, to a fresh session/agent.

User instruction to follow literally: continue the phases **sequentially, one at a time**,
verifying each with a grep sweep + typecheck before moving to the next. Do not batch all
phases into one giant edit pass — do them in order (10, then 11, then 12, then 13).

## Token source
- Canonical: `components/onboarding/dusk/tokens.ts`
- Re-exported (use this import path in all app/component files): `@/components/design/tokens`
- Import line to add wherever missing: `import { DUSK } from '@/components/design/tokens'`

## Established color-mapping convention (apply consistently)
- `'#fff'` / `rgba(255,255,255,.92)` → `DUSK.textPrimary`
- `'#1a0800'` → `DUSK.onAmber`
- `rgba(215,215,255,X)` with opacity **≤ ~.65** → `DUSK.textMuted`
- `rgba(215,215,255,X)` with opacity **≥ ~.75** (nothing below .68 seen so far, judge case by
  case around .65–.75; if truly ambiguous default to `textMuted`) → `DUSK.textSecondary`
- Tailwind arbitrary-value classes (e.g. `text-[rgba(215,215,255,.55)]`) **cannot** consume a
  JS-interpolated DUSK constant — Tailwind JIT needs statically analyzable class strings. For
  these, hardcode the DUSK token's literal value directly into the class string instead of
  importing DUSK for that specific use.

## Deliberate exclusions — do NOT touch
- `border:` CSS property literals (e.g. `'1.5px solid rgba(215,215,255,.35)'` on
  checkbox/radio outlines) — no exact DUSK border-token equivalent for this muted-purple hue.
  Every already-migrated file only ever touched `color:` / `stroke=` properties, never
  `border:` literals. Stay consistent.
- `ACCENT`, `ACCENT_LIGHT`, `ACCENT_DARK`, `ACCENT_GRADIENT`, `GLASS_FILL`, `GLASS_BORDER`
  (from `./domain-ui`) — legacy aliases that must stay literal per
  `docs/liquid-glass-design-system.md`'s "Alias note" (SVG presentation attrs / alpha
  interpolation can't consume `var()` strings).
- Amber/accent literals like `#f5a623`, `#f8c04a` — out of scope, these are accent colors not
  text colors, leave untouched.
- The separate, older "Liquid Glass" mobile token set (`app/globals.css` +
  `components/mobile` `tokens.textMuted` / `tokens.surfaceSolid` / `tokens.glassStandardBorder`
  etc.) is a **different, coexisting system** — do not replace `tokens.*` usages with `DUSK.*`.
  Only target the raw hardcoded literals described above.

## Verification loop for every file (per phase)
```bash
grep -n "rgba(215,215,255\|color: '#fff'\|color: \"#fff\"\|'#1a0800'" <file>
```
Should show zero matches when done (except intentionally-preserved `border:` literals, which
are fine to remain).

Then typecheck filtered to touched files:
```bash
npx tsc --noEmit -p . 2>&1 | grep -i "<FileNameA>\|<FileNameB>"
```
Should show no output.

## Fact-Forcing Gate note
A pre-Edit hook blocks every `Edit` call until you present, in plain text immediately before
the tool call: (1) importers of the file (via Grep), (2) public functions/classes affected,
(3) data-file read/write details (N/A — UI-only), (4) verbatim quote of the user's current
instruction. This fires on every single Edit call, even near-identical ones. Also: if an Edit
gets gate-blocked, it does NOT apply — always verify the edit actually landed (re-grep) before
assuming success, especially when multiple edits were sent in parallel and one silently failed
while another succeeded.

---

## Faz 10 — New trip flow (heaviest phase, do this first)
**File:** `app/trips/new/NewTripClient.tsx`
- 14 literal occurrences matching the target pattern (not 25 as originally estimated — re-verify
  with the grep command above once you start, since this file is large and hand-recount may be
  imprecise).
- Does **not** currently import DUSK — add the import.
- This is the biggest single file in the remaining set. Read it in chunks, migrate top to
  bottom, then run the full-file verification grep before moving to Faz 11.

## Faz 11 — Journal shared component
**File:** `components/journal/TripSummaryHero.tsx`
Known literals (line numbers as of this handoff — re-grep to confirm, line numbers may drift):
- L64: `color: 'rgba(215,215,255,.55)'` → `DUSK.textMuted`
- L67: `color: '#fff'` → `DUSK.textPrimary`
- L68: `color: 'rgba(215,215,255,.6)'` → `DUSK.textMuted`
- L99: `color: '#fff'` → `DUSK.textPrimary`
- L103: `color: 'rgba(215,215,255,.5)'` → `DUSK.textMuted`
No DUSK import present yet — add it.

## Faz 12 — Shared UI primitives
- `components/ui/AppBottomNav.tsx`:
  - L53: `color: '#fff'` → `DUSK.textPrimary` (avatar initials). The `border: isActive ?
    '1.5px solid #f5a623' : 'none'` on the same line is an accent border — leave untouched.
  - L57, L59: `rgba(215,215,255,0.40)` (inactive icon/label color, ternary against
    `'#f5a623'` accent) → `DUSK.textMuted`. Leave the `#f5a623` accent branch untouched.
- `components/ui/confirm-dialog.tsx`:
  - L77: `color: '#fff'` → `DUSK.textPrimary`
  - L78: `color: 'rgba(215,215,255,.65)'` → `DUSK.textMuted`
  - L97: `color: '#fff'` (button) → `DUSK.textPrimary`
- `components/ui/segmented-tabs.tsx`:
  - L40: Tailwind class `text-[rgba(215,215,255,.55)]` → hardcode
    `text-[rgba(222,220,240,0.58)]` (DUSK.textMuted's literal value) — do NOT import DUSK for
    this, per the Tailwind-arbitrary-value rule above.
  - L41: Tailwind class `hover:text-[rgba(215,215,255,.8)]` → hardcode
    `hover:text-[rgba(222,220,240,0.76)]` (DUSK.textSecondary's literal value).
- `components/ui/deferred-boundary.tsx`:
  - L24: `color: '#fff'` → `DUSK.textPrimary`
- `components/ui/toast.tsx`: no matches found — skip, nothing to do here (already clean or
  never had target literals). Re-grep to confirm before skipping.
None of these five files currently import DUSK — add the import to each one you actually edit.

## Faz 13 — Route state component
**File:** `components/route-state.tsx`
Known literals:
- L12: `color: '#fff',` (object literal, likely a style const) → `DUSK.textPrimary`
- L21: `color: 'rgba(215,215,255,.68)'` → `DUSK.textSecondary` (note: .68 is borderline —
  textSecondary chosen here since it's the "Loading your trip data…" primary loading message,
  matching how similarly-weighted secondary text was treated in earlier phases; use judgment)
- L33: `color: 'rgba(215,215,255,.65)'` → `DUSK.textMuted`
- L39: `color: '#1a0800'` (button, on amber gradient background) → `DUSK.onAmber`
No DUSK import present yet — add it.

---

## After Faz 13
Once all four phases are done and verified, report completion to the user in Turkish (they've
been communicating in Turkish throughout: "sirayla devam edelim" = continue sequentially).
No git commit has been made for any of this work — do not commit unless the user explicitly
asks. All changes remain in the working tree uncommitted.
