# Liquid Glass Mobile Design System (Aşama 2)

Mobile-only (320–430 px) semantic token layer + primitive component set over
Tripper's dark cinematic Liquid Glass identity. Tokens live in
`app/globals.css`; JS-side `var()` references in `components/mobile/tokens.ts`.

## Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg-base` | `#06061c` | App gradient start |
| `--color-bg-mid` | `#0a1020` | App gradient middle |
| `--color-bg-deep` | `#071216` | App gradient end |
| `--gradient-bg-app` | 145deg base→mid→deep | Trip workspace background |
| `--color-surface-solid` | `#11122b` | Opaque dense-content surface |
| `--color-surface-raised` | `#191a38` | Opaque card above the background |
| `--color-text-primary` | `#ffffff` | Titles, primary copy |
| `--color-text-secondary` | `rgba(215,215,255,.75)` | Supporting copy |
| `--color-text-muted` | `rgba(215,215,255,.55)` | Hints, metadata |
| `--color-text-on-accent` | `#1a0800` | Text on accent gradients |
| `--color-accent` | `#f5a623` | Primary accent (preserved) |
| `--color-accent-light` | `#f8c04a` | Accent highlight (preserved) |
| `--color-accent-dark` | `#e8821a` | Accent shade |
| `--gradient-accent` | 135deg accent→light | Accent fills |
| `--gradient-accent-cta` | 145deg light→dark | FAB / primary CTA |
| `--color-success` / `--color-success-soft` | `#4ade80` / `#86efac` | Positive state |
| `--color-warning` | `#fbbf24` | Caution state |
| `--color-danger` | `#f87171` | Error state |
| `--color-info` | `#60a5fa` | Informational state |
| `--color-ai` | `#8888e4` | AI/collaboration features |
| `--scrim-top` / `--scrim-bottom` | dark gradients | Text over map/photos |

### Glass tiers

| Tier | Fill | Border | Blur | Shadow | Where |
| --- | --- | --- | --- | --- | --- |
| `--glass-subtle-*` | `rgba(255,255,255,.035)` | `rgba(255,255,255,.08)` | 12px | none | Inline accents, tab tracks |
| `--glass-standard-*` | `rgba(255,255,255,.055)` | `rgba(255,255,255,.13)` | 20px | `0 6px 20px rgba(0,0,0,.2)` | Floating cards, icon buttons, map controls |
| `--glass-elevated-*` | `rgba(14,14,36,.92)` | `rgba(255,255,255,.16)` | 24px | `0 -12px 40px rgba(0,0,0,.35)` | Sheets, toasts, primary nav chrome |

Utilities: `.glass-subtle` / `.glass-standard` / `.glass-elevated` (globals.css).
`@supports not (backdrop-filter…)` swaps fills for near-opaque solids.

### Radius, spacing, motion

- Radius: `--radius-8/12/16/20/24/full`
- Spacing: `--space-4/8/12/16/20/24/32` (screen 16 / section 24 / card 16 / list 12 / compact 8)
- Motion: `--motion-fast|normal|slow` (150/250/400ms), `--ease-standard|out|spring`
- `skeleton-pulse` keyframe (opacity-only), disabled under `prefers-reduced-motion`

## Usage rules

- Strong glass **only** on floating chrome: nav, sheets, headers, selected previews, map controls.
- Dense content (itinerary, bookings, budget, packing, journal text) uses opaque `--color-surface-*` — no per-item blur.
- Accent orange restricted to the primary action per screen (FAB/CTA), active nav state, and status accents.
- Body ≥14 px, helper 12–13 px, never <12 px on critical content.
- Touch targets ≥44×44; color never the only state signal (chips carry icon+text).

## Primitives (`components/mobile/`)

| Component | Notes |
| --- | --- |
| `GlassSurface` | subtle/standard/elevated, `as` polymorphism, ref forwarding |
| `MobilePageHeader` | safe-area, leading/trailing slots, solid/overlay (scrim) variants |
| `MobileBottomSheet` | dependency-free dialog: focus trap, Escape, focus return, keyboard-aware via visualViewport, reduced-motion aware |
| `FloatingActionButton` | 56px accent CTA, required aria-label, safe-area offset |
| `DayStrip` | horizontal scroll, roving tabindex + arrow keys, visible TODAY tag |
| `StatusChip` / `FilterChip` | 7 tones; icon+text; FilterChip exposes aria-pressed, ≥44px |
| `MobileListRow` | blur-free dense row: leading/title/subtitle/metadata/trailing; renders a/button/div |
| `EmptyState` / `InlineError` / `SkeletonBlock` | shared feedback states |
| `OfflineBanner` | `navigator.onLine` via useSyncExternalStore, polite aria-live |

## Migrated in this phase

- `app/globals.css` — token layer, glass utilities, backdrop fallback, skeleton keyframe
- Trip shell: `TripMobileClient` (bg/text), `TripMobileHeader` (scrim + glass tokens), `TripPrimaryNav` (glass tokens), `BottomSheet` (now delegates to `MobileBottomSheet`, framer-motion removed from sheet path), `domain-ui.tsx` (component bodies on tokens; constants kept as documented legacy aliases)
- Example domain: `BookingsDomain` — opaque raised cards (blur removed), `MobileListRow`, `StatusChip`, `EmptyState`
- Shared UI nudged: `segmented-tabs` (glass/accent tokens), `toast` (elevated glass tokens)

## Not yet migrated (next phases)

- `PlanRouteDomain` (draggable sheet, route cards, FAB → `FloatingActionButton`, Days tab → `DayStrip`)
- `BudgetDomain`, `PrepDomain`, `JournalDomain` (cards → solid surfaces, skeletons → `SkeletonBlock`)
- `ExploreDomain`, `TripMoreSheet`/`TripAddSheet` rows (`SheetOptionRow` already tokenized)
- Auth/trips/dashboard screens outside the trip workspace
- Legacy aliases in `domain-ui.tsx` (`ACCENT*`, `GLASS_*`) — removable once SVG-attribute and alpha-interpolation call sites are migrated

## Alias note

`ACCENT`, `ACCENT_LIGHT`, `ACCENT_DARK`, `ACCENT_GRADIENT`, `GLASS_FILL`,
`GLASS_BORDER` must stay literal hex/rgba: SVG presentation attributes
(`stroke={ACCENT}`) and alpha interpolations (`` `${ACCENT}22` ``) cannot
consume `var()` strings. New code imports `tokens` from `@/components/mobile`.
