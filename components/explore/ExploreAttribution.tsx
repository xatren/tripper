export function ExploreAttribution({ compact = false }: { compact?: boolean }) {
  return (
    <span
      translate="no"
      aria-label="Google Maps"
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: compact ? 20 : 24, color: 'rgba(215,215,255,.62)', fontSize: compact ? 10.5 : 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}
    >
      Google Maps
    </span>
  )
}

