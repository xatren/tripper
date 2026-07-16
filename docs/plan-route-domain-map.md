# PlanRouteDomain.tsx responsibility map

[app/trip/[id]/mobile/PlanRouteDomain.tsx](app/trip/[id]/mobile/PlanRouteDomain.tsx) is ~1290 lines and the largest single component in the codebase. This map exists to make its responsibilities visible before any refactor — it does not change behavior. Line numbers are approximate as of 2026-07-15; re-grep before relying on an exact line.

## Section breakdown

| Approx. lines | Responsibility | Notes |
|---|---|---|
| 1–22 | Imports | framer-motion, dnd-kit, Mapbox directions/optimize, weather, `.ics` export, domain utils |
| 24–36 | `TripMapPlaceholder` | Map loading skeleton |
| 39–65 | Constants/types | Bottom-sheet snap heights, `Section` type, component props interface |
| 67–121 | `WeatherIcon` | Pure SVG icon renderer keyed by `WeatherKind` |
| 127–140 | Shared button style constant | |
| 144–175 | Component setup | State declarations, dynamic `import()` of `TripboxMap` (code-splitting) with a load-failure flag |
| 177–200 | Bottom-sheet drag mechanics | Snap points + native Pointer Events handlers (`handlePointerDown/Move/Up`) — pure gesture/UI, no data |
| 244–265 | **Route fetch** | Debounced Directions API call (`getFullRoute`) keyed on the stop-coordinate signature, with `AbortController` cancellation |
| 267–294 | Toast/UX polish | "Just added" marker highlight timer; route-duration-delta toast shown after adding a stop |
| 296–316 | **Stop mutation — nights** | `changeNights`: optimistic update to `nights` and `stops` state, Supabase `.update`, rollback on error + retry toast |
| 318–343 | **Stop mutation — delete/rename** | `handleDeleteStop`, `handleRenameStop`: non-optimistic, single request then state commit |
| 345–374 | **Stop mutation — reorder** | dnd-kit sensor setup + `applyStopOrder`: optimistic reorder, atomic `reorder_trip_stops` RPC, rollback + retry toast; also toggles `onStopSyncPaused` to pause the parent's realtime listener during the write |
| 376–420 | **Route optimization** | `handleOptimize` (calls `getOptimizedOrder`, builds a before/after preview — no mutation yet), `handleDragEnd` (dnd-kit end handler calling `applyStopOrder`), `applyOptimizePreview` (commits the optimize result via `applyStopOrder`) |
| 421–454 | **Stop mutation — add** | `handleAddStop`: Supabase insert, sets `lastAddedStopId` for map/list highlight, retry-via-toast on failure |
| 456–471 | Derived display values | `stopSchedule`, route summary text, nights-ring math, `emptyStateSuggestions` |
| 473–868 | **Main render** | A single ~400-line JSX tree — see "Tangled concerns" below |
| 872–992 | `OptimizePreviewSheet` | Dedicated before/after comparison sheet — presentational, callbacks (`onApply`/`onDismiss`) into the optimize mutation |
| 994–1005 | `SortableStopItem` | dnd-kit `useSortable` wrapper, pure drag presentation |
| 1007–1150 | `DaysTab` | **Days grouping** (renders `schedule` computed upstream via `computeStopSchedule`) + **weather integration** (`fetchWeatherForStops`) + `.ics` calendar export (`downloadTripIcs`) — three concerns in one component |
| 1152–1236 | `BookingsTab` | **Booking partner links**: renders the `BOOKING_PARTNERS` list with `bookingUrl()` deep links per partner, Booking.com quick-add CTA, date pre-fill messaging. Pure link generation, no mutation. |
| 1238–1245 | `ComingSoon` | Generic empty/placeholder, reused by Days and Bookings tabs |
| 1247–1290 | `TripBottomNav` | Bottom nav shared across all four domain sections (also imported by `TripMobileClient.tsx`) |

## Tangled concerns

These are documented, not fixed — any future split should account for them:

1. **`applyStopOrder` (345–374)** does three unrelated things in one function: local optimistic state update, the Supabase RPC mutation, and cross-component realtime coordination (calling `onStopSyncPaused`, a prop that pauses the parent's realtime listener in `TripMobileClient.tsx`). A future split should separate "compute new order" from "persist it" from "coordinate with realtime."
2. **The main render block (473–868)** is the single largest concentration of tangled responsibility in the file: map rendering, floating header, draggable bottom-sheet chrome, the Route tab's stop list (with inline rename/delete and route-leg distance/duration display), tab switching, and modal orchestration (`DestinationDialog`, `OptimizePreviewSheet`, delete `ConfirmDialog`) all live in one JSX tree with no sub-component extraction — unlike Days/Bookings, which did get their own `DaysTab`/`BookingsTab` functions.
3. **`DaysTab` (1007–1150)** combines day-grouping display, a weather-fetch side effect, and calendar export inside one component — three largely independent features that happen to render together.
4. **Route-fetch effect (244–265) and the toast-delta logic (276–294)** are two separate effects coupled only through mutable refs (`routeTotalRef`, `pendingAddTotalRef`) — the second effect exists purely so `handleAddStop` can show a "+X min" toast, coupling mutation UX feedback to the route-fetch effect via a ref side-channel instead of direct state.

## Capability gating in this file

`canEdit` (from `lib/trip-capabilities.ts`) is checked in 28 places across `PlanRouteDomain.tsx` — every mutation function (`changeNights`, `handleDeleteStop`, `handleRenameStop`, `handleAddStop`, `applyStopOrder`, `applyOptimizePreview`, `handleOptimize`, `handleDragEnd`) guards `if (!canEdit) return` at its top, in addition to the corresponding UI (FAB, rename/delete icons, Optimize button, nights stepper) being hidden or rendered read-only for non-editors. `canManageTrip` (owner-only) is not referenced anywhere in this file — no owner-only action currently exists in the Plan tab.

## Suggested (not yet performed) safe-refactor candidates

None of these were applied in this pass — they're recorded for a future, dedicated refactor PR so they can be reviewed against the regression checklist:

- Extract the Route tab's stop list (part of 628–831) into its own component, mirroring the existing `DaysTab`/`BookingsTab` pattern.
- Extract weather-fetching out of `DaysTab` into a small hook (e.g. `useStopWeather(stops)`) so day-grouping display and weather concerns can be tested/changed independently.
- Give `applyStopOrder` three explicit steps (compute → persist → notify realtime) even if kept in one function, to make the realtime-pause side effect visible at the call site rather than buried mid-function.
