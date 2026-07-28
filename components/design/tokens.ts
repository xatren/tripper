/* ─────────────────────────────────────────────────────────────────────
   Shared Dusk Edition tokens — non-onboarding-scoped re-export.

   The canonical implementation lives in components/onboarding/dusk/tokens.ts
   (authored against docs/onboarding-dusk-journey-prompts.md and the
   claude.ai/design "Tripper Design System — Dusk Edition" project). Screens
   outside onboarding should import from here rather than reaching into the
   onboarding module directly, since that path implies "onboarding only."
───────────────────────────────────────────────────────────────────── */

export {
  DUSK,
  SUNSET_GRADIENT,
  GROUND_GRADIENT,
  EASE_STANDARD,
  EASE_SPRING,
  FONT_INTER,
  FONT_FRAUNCES,
  glassCard,
  pillPrimary,
  pillGhost,
  gradientText,
} from '@/components/onboarding/dusk/tokens'
