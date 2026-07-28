import type mapboxgl from 'mapbox-gl'

/**
 * Repaints a stock Mapbox style's layers to match the app's dark amber/purple
 * palette. Works by walking every layer in the loaded style rather than
 * hardcoding layer ids, so it keeps working across dark-v11 style revisions.
 */
export function applyAppTheme(map: mapboxgl.Map) {
  const style = map.getStyle()
  if (!style?.layers) return

  for (const layer of style.layers) {
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', '#06061c')
      } else if (layer.type === 'fill') {
        if (sourceLayer === 'water') {
          map.setPaintProperty(layer.id, 'fill-color', '#150f2a')
        } else if (sourceLayer === 'landuse' || sourceLayer === 'landcover' || sourceLayer === 'national_park') {
          map.setPaintProperty(layer.id, 'fill-color', '#120c1e')
        }
      } else if (layer.type === 'line') {
        if (sourceLayer === 'road' || sourceLayer === 'bridge' || sourceLayer === 'tunnel') {
          map.setPaintProperty(layer.id, 'line-color', '#3a2740')
        } else if (sourceLayer === 'admin') {
          map.setPaintProperty(layer.id, 'line-color', '#4a3050')
        }
      } else if (layer.type === 'symbol') {
        if (sourceLayer === 'poi_label' || sourceLayer === 'transit_stop_label') {
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        } else if (sourceLayer === 'road_label' || sourceLayer === 'place_label' || sourceLayer === 'natural_label') {
          map.setPaintProperty(layer.id, 'text-color', '#a3899e')
          map.setPaintProperty(layer.id, 'text-halo-color', '#06061c')
          map.setPaintProperty(layer.id, 'text-halo-width', 1)
        }
      }
    } catch {
      // Not every paint/layout property applies to every layer instance — skip individually.
    }
  }
}
