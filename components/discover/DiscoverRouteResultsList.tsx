'use client'

import type { DiscoverRoute } from '@/lib/discover/discover-routes.generated'
import { DiscoverRouteCard } from './DiscoverRouteCard'
import styles from './DiscoverResultsList.module.css'

export interface DiscoverRouteResultsListProps {
  routes: readonly DiscoverRoute[]
  selectedRouteId: string | null
  onSelectRoute: (id: string) => void
  onOpenDetail?: (id: string) => void
}

/**
 * The `routes` category's results list — reuses `DiscoverResultsList.module.css`
 * (the `<ul>`/`content-visibility` shell is category-agnostic) but renders
 * `DiscoverRouteCard` rows instead of place cards, since routes have no
 * marker-scroll-sync id lookup to key a `data-place-id` off (§4.3 doesn't apply
 * to a line layer the same way it does to pins).
 */
export function DiscoverRouteResultsList({ routes, selectedRouteId, onSelectRoute, onOpenDetail }: DiscoverRouteResultsListProps) {
  return (
    <ul className={styles.list}>
      {routes.map((route) => (
        <li key={route.id}>
          <DiscoverRouteCard
            route={route}
            isSelected={route.id === selectedRouteId}
            onSelect={onSelectRoute}
            onOpenDetail={onOpenDetail}
          />
        </li>
      ))}
    </ul>
  )
}
