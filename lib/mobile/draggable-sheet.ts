// Pure gesture logic for DraggableSheet, kept alias-free (`../` imports only,
// no JSX) so `tests/discover-sheet.test.mts` can load it under
// `node --experimental-strip-types`, per the repo's pure-logic test convention.
// `components/mobile/DraggableSheet.tsx` re-exports both names.

export type SheetLevel = 'collapsed' | 'half' | 'expanded'

const SHEET_ORDER: SheetLevel[] = ['collapsed', 'half', 'expanded']

/** Maps a drag delta (px, positive = downward) onto the next sheet level. */
export function levelFromGesture(level: SheetLevel, delta: number): SheetLevel {
  const index = SHEET_ORDER.indexOf(level)
  if (delta < -45 && index < SHEET_ORDER.length - 1) return SHEET_ORDER[index + 1]
  if (delta > 45 && index > 0) return SHEET_ORDER[index - 1]
  return level
}
