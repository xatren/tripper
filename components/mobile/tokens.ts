/**
 * JS-side references to the Liquid Glass design tokens declared in
 * app/globals.css. Import these in inline `style` objects so component code
 * stays on the semantic layer instead of literal colors.
 *
 * NOTE: these are `var()` strings — safe in `style={{ … }}` (including SVG
 * elements via `style`), but NOT in SVG presentation attributes like
 * `stroke="…"` or in string interpolation such as `` `${ACCENT}22` ``.
 * For those, keep literal values from app/trip/[id]/mobile/domain-ui.tsx.
 */
export const tokens = {
  bgBase: 'var(--color-bg-base)',
  bgDeep: 'var(--color-bg-deep)',
  bgAppGradient: 'var(--gradient-bg-app)',

  surfaceSolid: 'var(--color-surface-solid)',
  surfaceRaised: 'var(--color-surface-raised)',

  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  textMuted: 'var(--color-text-muted)',
  textOnAccent: 'var(--color-text-on-accent)',

  accent: 'var(--color-accent)',
  accentLight: 'var(--color-accent-light)',
  accentDark: 'var(--color-accent-dark)',
  accentGradient: 'var(--gradient-accent)',
  accentCtaGradient: 'var(--gradient-accent-cta)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-soft)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
  ai: 'var(--color-ai)',

  glassSubtleFill: 'var(--glass-subtle-fill)',
  glassSubtleBorder: 'var(--glass-subtle-border)',
  glassStandardFill: 'var(--glass-standard-fill)',
  glassStandardBorder: 'var(--glass-standard-border)',
  glassStandardShadow: 'var(--glass-standard-shadow)',
  glassElevatedFill: 'var(--glass-elevated-fill)',
  glassElevatedBorder: 'var(--glass-elevated-border)',
  glassElevatedShadow: 'var(--glass-elevated-shadow)',

  scrimTop: 'var(--scrim-top)',
  scrimBottom: 'var(--scrim-bottom)',

  radius8: 'var(--radius-8)',
  radius12: 'var(--radius-12)',
  radius16: 'var(--radius-16)',
  radius20: 'var(--radius-20)',
  radius24: 'var(--radius-24)',
  radiusFull: 'var(--radius-full)',

  space4: 'var(--space-4)',
  space8: 'var(--space-8)',
  space12: 'var(--space-12)',
  space16: 'var(--space-16)',
  space20: 'var(--space-20)',
  space24: 'var(--space-24)',
  space32: 'var(--space-32)',

  motionFast: 'var(--motion-fast)',
  motionNormal: 'var(--motion-normal)',
  motionSlow: 'var(--motion-slow)',
  easeStandard: 'var(--ease-standard)',
  easeOut: 'var(--ease-out)',
  easeSpring: 'var(--ease-spring)',
} as const

export type GlassVariant = 'subtle' | 'standard' | 'elevated'
