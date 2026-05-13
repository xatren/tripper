'use client';

import { useMemo } from 'react';
import { useTripStore } from '@/store/tripStore';

export function useRoute() {
  const { routeWaypoints, addWaypoint, removeWaypoint, clearRoute, setRouteWaypoints } =
    useTripStore();

  const totalEstimatedCost = useMemo(
    () => routeWaypoints.reduce((sum, pin) => sum + (pin.estimated_cost ?? 0), 0),
    [routeWaypoints]
  );

  return {
    waypoints: routeWaypoints,
    addWaypoint,
    removeWaypoint,
    clearRoute,
    reorder: setRouteWaypoints,
    totalEstimatedCost,
  };
}
