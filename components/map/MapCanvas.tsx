'use client';

import { useCallback, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  DirectionsRenderer,
} from '@react-google-maps/api';
import { GOOGLE_MAPS_LIBRARIES, USA_CENTER, USA_ZOOM, DARK_MAP_STYLE } from '@/lib/google-maps/config';
import { useTripStore } from '@/store/tripStore';
import { PinMarker } from './PinMarker';
import type { Pin } from '@/types';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS: google.maps.MapOptions = {
  styles: DARK_MAP_STYLE,
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
};

interface MapCanvasProps {
  directionsResult?: google.maps.DirectionsResult | null;
}

export function MapCanvas({ directionsResult }: MapCanvasProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const { pins, selectedPin, setSelectedPin, setNewPinDraft } = useTripStore();

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setSelectedPin(null);
      setNewPinDraft({ lat, lng });
    },
    [setSelectedPin, setNewPinDraft]
  );

  const handlePinClick = useCallback(
    (pin: Pin) => {
      setNewPinDraft(null);
      setSelectedPin(pin);
    },
    [setSelectedPin, setNewPinDraft]
  );

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0A0A0F]">
        <div className="text-center p-8">
          <span className="text-4xl mb-3 block">🗺️</span>
          <p className="text-red-400 font-medium">Failed to load Google Maps</p>
          <p className="text-slate-500 text-sm mt-1">Check your API key in .env.local</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0A0A0F]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={USA_CENTER}
      zoom={USA_ZOOM}
      options={MAP_OPTIONS}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={handleMapClick}
    >
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pin={pin}
          isSelected={selectedPin?.id === pin.id}
          onClick={handlePinClick}
        />
      ))}

      {directionsResult && (
        <DirectionsRenderer
          directions={directionsResult}
          options={{
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: '#F59E0B',
              strokeWeight: 4,
              strokeOpacity: 0.8,
            },
          }}
        />
      )}
    </GoogleMap>
  );
}
