'use client'

import { Layer, Source } from 'react-map-gl/mapbox'
import {
  COUNTRY_BOUNDARIES_SOURCE_LAYER,
  COUNTRY_BOUNDARIES_SOURCE_URL,
  countryFilter,
} from '@/lib/mapbox/country-layers'
import type { DiscoverFeatureCollection } from '@/lib/discover/discover-query'

/** Literal because Mapbox paint expressions are evaluated off the document — a CSS custom property can't reach them. Mirrors `--color-accent`. */
const ACCENT = '#f5a623'

export const DISCOVER_PLACES_SOURCE = 'discover-places'
export const DISCOVER_PIN_LAYER = 'discover-pin'
export const DISCOVER_CLUSTER_LAYER = 'discover-clusters'
/** Layers the map hit-tests on click. Pins are listed first so an overlapping pin wins over its cluster. */
export const DISCOVER_INTERACTIVE_LAYERS = [DISCOVER_PIN_LAYER, DISCOVER_CLUSTER_LAYER]

export interface DiscoverMapLayersProps {
  /** ISO alpha-2 codes to tint. Empty renders nothing, which is the world view. */
  highlightCodes: string[]
  /** Layer id to insert beneath, so the tint never washes over place labels. */
  beforeId?: string
  /** Pins for the active category. One category renders at a time, so one source is enough. */
  places: DiscoverFeatureCollection
  /** The active category's colour, applied to every pin in the layer. */
  markerColor: string
  selectedPlaceId: string | null
}

export function DiscoverMapLayers({
  highlightCodes,
  beforeId,
  places,
  markerColor,
  selectedPlaceId,
}: DiscoverMapLayersProps) {
  const filter = countryFilter(highlightCodes)

  return (
    <>
      {/*
        Country framing. Deliberately far subtler than the New Trip wizard globe's
        0.5-opacity fill: this tint sits under discovery pins that have to stay
        legible on top of it.
      */}
      <Source id="discover-country-boundaries" type="vector" url={COUNTRY_BOUNDARIES_SOURCE_URL}>
        <Layer
          id="discover-country-tint"
          source-layer={COUNTRY_BOUNDARIES_SOURCE_LAYER}
          type="fill"
          filter={filter}
          beforeId={beforeId}
          paint={{ 'fill-color': ACCENT, 'fill-opacity': 0.12 }}
        />
        <Layer
          id="discover-country-glow"
          source-layer={COUNTRY_BOUNDARIES_SOURCE_LAYER}
          type="line"
          filter={filter}
          beforeId={beforeId}
          paint={{ 'line-color': ACCENT, 'line-width': 5, 'line-opacity': 0.16, 'line-blur': 3 }}
        />
        <Layer
          id="discover-country-border"
          source-layer={COUNTRY_BOUNDARIES_SOURCE_LAYER}
          type="line"
          filter={filter}
          beforeId={beforeId}
          paint={{ 'line-color': '#ffc766', 'line-width': 1.4, 'line-opacity': 0.72 }}
        />
      </Source>

      {/*
        One GeoJSON source with native clustering rather than a React <Marker> per
        place (§5.2): clustering, hit-testing and label collision run in the Mapbox
        worker, so panning and selecting cost zero React reconciliation. Selection
        is a filter expression on a dedicated layer, not a re-render of an array.
      */}
      <Source
        id={DISCOVER_PLACES_SOURCE}
        type="geojson"
        data={places}
        cluster
        clusterRadius={48}
        // Above this zoom every place stands alone — a cluster at street level
        // would hide exactly the detail the user zoomed in for.
        clusterMaxZoom={12}
      >
        <Layer
          id={DISCOVER_CLUSTER_LAYER}
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': markerColor,
            'circle-opacity': 0.28,
            'circle-stroke-color': markerColor,
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.85,
            'circle-radius': ['step', ['get', 'point_count'], 16, 5, 21, 15, 27],
          }}
        />
        <Layer
          id="discover-cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-allow-overlap': true,
          }}
          paint={{ 'text-color': '#ffffff' }}
        />
        <Layer
          id={DISCOVER_PIN_LAYER}
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-color': markerColor,
            // Stays at or above the 9 px tap floor from §12 once the user is in.
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5.5, 6, 7, 12, 9],
            'circle-stroke-color': '#0b0b22',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.95,
          }}
        />
        <Layer
          id="discover-pin-selected"
          type="circle"
          // Selection costs one filter update, not a React pass over every pin.
          filter={['==', ['get', 'id'], selectedPlaceId ?? '']}
          paint={{
            'circle-color': markerColor,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 9, 12, 14],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2.5,
          }}
        />
        <Layer
          id="discover-pin-label"
          type="symbol"
          filter={['!', ['has', 'point_count']]}
          layout={{
            'text-field': ['get', 'name'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-max-width': 9,
            // Mapbox keeps the lowest sort key when labels collide, so negating
            // rank gives the best-known place the space.
            'symbol-sort-key': ['-', 0, ['get', 'rank']],
          }}
          paint={{
            'text-color': 'rgba(255,255,255,0.92)',
            'text-halo-color': 'rgba(6,6,28,0.9)',
            'text-halo-width': 1.2,
          }}
        />
      </Source>
    </>
  )
}
