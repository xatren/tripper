"use client";

import { useEffect, useRef } from "react";
import Globe from "react-globe.gl";

export interface GlobeCamera {
  lat: number;
  lng: number;
  altitude: number;
}

interface GlobePoint {
  lat: number;
  lng: number;
  label: string;
  size: number;
  color: string;
}

interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string[];
}

interface GlobePath {
  points: [number, number][];
  color: string;
}

interface Props {
  width: number;
  height: number;
  points: GlobePoint[];
  arcs: GlobeArc[];
  routePaths: GlobePath[];
  autoRotate: boolean;
  camera: GlobeCamera | null;
  flyToken: number;
  pathStroke?: number;
  onReady: () => void;
}

export function ExploreGlobe({
  width,
  height,
  points,
  arcs,
  routePaths,
  autoRotate,
  camera,
  flyToken,
  pathStroke = 0.55,
  onReady,
}: Props) {
  const globeRef = useRef<any>(null);

  const applyControls = (rotate: boolean) => {
    const ctrl = globeRef.current?.controls?.();
    if (!ctrl) return;
    ctrl.autoRotate = rotate;
    ctrl.autoRotateSpeed = rotate ? 0.55 : 0;
    ctrl.enableZoom = false;
    ctrl.enablePan = false;
  };

  const flyTo = (target: GlobeCamera, duration = 1400) => {
    const globe = globeRef.current;
    if (!globe?.pointOfView) return;
    applyControls(false);
    globe.pointOfView(
      { lat: target.lat, lng: target.lng, altitude: target.altitude },
      duration,
    );
  };

  useEffect(() => {
    applyControls(autoRotate);
  }, [autoRotate]);

  useEffect(() => {
    if (!globeRef.current || !camera || flyToken === 0) return;
    flyTo(camera);
  }, [flyToken, camera]);

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      animateIn={false}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      backgroundColor="rgba(0,0,0,0)"
      atmosphereColor="rgba(100,140,255,0.22)"
      atmosphereAltitude={0.16}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor="color"
      pointRadius="size"
      pointAltitude={0.01}
      pointResolution={16}
      pointLabel={(p: object) =>
        `<div style="background:rgba(8,8,28,0.92);border:1px solid rgba(245,166,35,0.4);border-radius:8px;padding:4px 10px;font-family:Inter,sans-serif;font-size:11px;color:#fff;white-space:nowrap">${(p as GlobePoint).label}</div>`
      }
      arcsData={arcs}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor="color"
      arcAltitude={0.28}
      arcStroke={0.55}
      arcDashLength={0.4}
      arcDashGap={0.2}
      arcDashAnimateTime={3200}
      pathsData={routePaths}
      pathPoints="points"
      pathPointLat={(p: [number, number]) => p[0]}
      pathPointLng={(p: [number, number]) => p[1]}
      pathColor="color"
      pathStroke={pathStroke}
      pathPointAlt={0.015}
      pathResolution={1}
      onGlobeReady={() => {
        applyControls(autoRotate);
        if (camera) flyTo(camera, 0);
        onReady();
      }}
    />
  );
}
