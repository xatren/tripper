import mapboxgl from 'mapbox-gl'
import type { LayerProps } from 'react-map-gl/mapbox'

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

if (typeof window !== 'undefined' && MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

export const MAPBOX_DARK_STYLE = 'mapbox://styles/mapbox/dark-v11'

export const DEFAULT_PITCH = 55
export const DEFAULT_BEARING = -17.6

/** Standard Mapbox 3D buildings recipe against the `composite` source baked into every core style. */
export const BUILDING_EXTRUSION_LAYER: LayerProps = {
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'fill-extrusion',
  minzoom: 14,
  paint: {
    'fill-extrusion-color': '#4a3145',
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    'fill-extrusion-opacity': 0.75,
  },
}
