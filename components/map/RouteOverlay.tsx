'use client';

import { useEffect, useState } from 'react';
import { useTripStore } from '@/store/tripStore';
import { MapCanvas } from './MapCanvas';

export function RouteOverlay() {
  const { routeWaypoints } = useTripStore();
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);

  useEffect(() => {
    if (routeWaypoints.length < 2) {
      setDirectionsResult(null);
      return;
    }

    if (typeof google === 'undefined') return;

    const service = new google.maps.DirectionsService();
    const origin = routeWaypoints[0];
    const destination = routeWaypoints[routeWaypoints.length - 1];
    const waypoints = routeWaypoints.slice(1, -1).map((pin) => ({
      location: { lat: pin.lat, lng: pin.lng },
      stopover: true,
    }));

    service.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirectionsResult(result);
        }
      }
    );
  }, [routeWaypoints]);

  return <MapCanvas directionsResult={directionsResult} />;
}
