"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, { Marker, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  MAPBOX_TOKEN,
  MAPBOX_DARK_STYLE,
  DEFAULT_PITCH,
} from "@/lib/mapbox/client";
import { applyAppTheme } from "@/lib/mapbox/theme";

export interface ExploreCamera {
  lat: number;
  lng: number;
  altitude: number;
}

export interface ExplorePoint {
  lat: number;
  lng: number;
  label: string;
  size: number;
  color: string;
}

export interface ExploreArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

interface Props {
  width: number;
  height: number;
  points: ExplorePoint[];
  arcs: ExploreArc[];
  routePath: { lat: number; lng: number }[];
  autoRotate: boolean;
  camera: ExploreCamera | null;
  flyToken: number;
  onReady: () => void;
  onUserInteract?: () => void;
}

const EXPLORE_FOG = {
  range: [0.5, 10] as [number, number],
  color: "rgba(100,140,255,0.22)",
  "high-color": "rgba(36,60,120,0.55)",
  "space-color": "#000010",
  "horizon-blend": 0.12,
};

/** globe.gl altitude → Mapbox zoom (empirical fit). */
function altitudeToZoom(altitude: number): number {
  if (altitude >= 1.6) return 1.2;
  if (altitude >= 0.88) {
    const t = (altitude - 0.88) / (1.6 - 0.88);
    return 4.2 - t * 3.0;
  }
  const t = (altitude - 0.44) / (0.88 - 0.44);
  return 7.8 - t * 3.6;
}

function altitudeToPitch(altitude: number): number {
  if (altitude >= 1.2) return 0;
  if (altitude >= 0.7) return 28;
  return DEFAULT_PITCH;
}

function markerPx(size: number): number {
  return Math.round(8 + size * 22);
}

export function ExploreMapbox({
  width,
  height,
  points,
  arcs,
  routePath,
  autoRotate,
  camera,
  flyToken,
  onReady,
  onUserInteract,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const readyRef = useRef(false);
  const rotateRef = useRef<number | null>(null);

  const arcGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: arcs.map((arc, i) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [arc.startLng, arc.startLat],
            [arc.endLng, arc.endLat],
          ],
        },
        properties: { id: i },
      })),
    }),
    [arcs],
  );

  const routeGeoJson = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: routePath.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    }),
    [routePath],
  );

  const flyTo = useCallback((target: ExploreCamera, duration = 1400) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: altitudeToZoom(target.altitude),
      pitch: altitudeToPitch(target.altitude),
      bearing: map.getBearing(),
      duration,
      essential: true,
    });
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      applyAppTheme(map);
      map.setFog(EXPLORE_FOG);
      map.on("style.load", () => {
        applyAppTheme(map);
        map.setFog(EXPLORE_FOG);
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      map.on("dragstart", () => onUserInteract?.());
      map.on("zoomstart", () => onUserInteract?.());
    }
    if (camera) flyTo(camera, 0);
    if (!readyRef.current) {
      readyRef.current = true;
      onReady();
    }
  }, [camera, flyTo, onReady, onUserInteract]);

  useEffect(() => {
    if (!mapRef.current || !camera || flyToken === 0) return;
    flyTo(camera);
  }, [flyToken, camera, flyTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!autoRotate) {
      if (rotateRef.current != null) {
        cancelAnimationFrame(rotateRef.current);
        rotateRef.current = null;
      }
      return;
    }

    let last = performance.now();
    const spin = (now: number) => {
      const delta = now - last;
      last = now;
      const m = mapRef.current?.getMap();
      if (m && autoRotate) {
        m.setBearing(m.getBearing() + delta * 0.004);
      }
      rotateRef.current = requestAnimationFrame(spin);
    };
    rotateRef.current = requestAnimationFrame(spin);

    return () => {
      if (rotateRef.current != null) cancelAnimationFrame(rotateRef.current);
      rotateRef.current = null;
    };
  }, [autoRotate]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.4)",
          fontSize: 13,
        }}
      >
        Mapbox token not configured
      </div>
    );
  }

  const initial = camera ?? { lat: 20, lng: 0, altitude: 1.8 };

  return (
    <div className="explore-map" style={{ width, height, position: "relative", background: "#000010" }}>
      <style>{`
        .explore-map .mapboxgl-ctrl-logo {
          transform: scale(.68);
          transform-origin: bottom left;
          opacity: .75;
        }
        .explore-map .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-attrib {
          background: rgba(10,10,26,.45);
          backdrop-filter: blur(6px);
          border-radius: 8px;
          font-size: 9px;
          padding: 0 5px;
        }
        .explore-map .mapboxgl-ctrl-attrib a { color: rgba(255,255,255,.45) !important; }
        .explore-map .mapboxgl-ctrl-attrib-button { filter: invert(1) brightness(1.6); }
      `}</style>

      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        projection="globe"
        initialViewState={{
          latitude: initial.lat,
          longitude: initial.lng,
          zoom: altitudeToZoom(initial.altitude),
          pitch: altitudeToPitch(initial.altitude),
          bearing: 0,
        }}
        onLoad={handleLoad}
        mapStyle={MAPBOX_DARK_STYLE}
        style={{ width: "100%", height: "100%" }}
        dragRotate
        touchZoomRotate
        attributionControl={false}
        logoPosition="bottom-right"
        maxPitch={85}
      >
        {arcs.length > 0 && (
          <Source id="explore-arcs" type="geojson" data={arcGeoJson}>
            <Layer
              id="explore-arcs-line"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "rgba(245,166,35,0.55)",
                "line-width": 1.5,
                "line-opacity": 0.7,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        )}

        {routePath.length > 1 && (
          <Source id="explore-route" type="geojson" data={routeGeoJson}>
            <Layer
              id="explore-route-glow"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "#60a5fa",
                "line-width": 6,
                "line-opacity": 0.25,
              }}
            />
            <Layer
              id="explore-route-line"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "#60a5fa",
                "line-width": 2.5,
                "line-opacity": 0.92,
              }}
            />
          </Source>
        )}

        {points.map((p, i) => {
          const px = markerPx(p.size);
          const isAccent = p.color.includes("245") || p.color.includes("f5a623");
          return (
            <Marker
              key={`${p.lat}-${p.lng}-${p.label}-${i}`}
              latitude={p.lat}
              longitude={p.lng}
              anchor="center"
            >
              <div
                title={p.label}
                style={{
                  width: px,
                  height: px,
                  borderRadius: "50%",
                  background: p.color,
                  border: `2px solid ${isAccent ? "#1a0800" : "rgba(255,255,255,0.35)"}`,
                  boxShadow: isAccent
                    ? "0 0 14px rgba(245,166,35,0.55)"
                    : "0 0 10px rgba(96,165,250,0.35)",
                  cursor: "default",
                }}
              />
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
