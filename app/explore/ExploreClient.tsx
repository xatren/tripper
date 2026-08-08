"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotionPreference } from "@/components/motion/ReducedMotionProvider";
import { DeferredBoundary, DeferredFailure } from "@/components/ui/deferred-boundary";
import type { ExploreCamera } from "@/components/explore/ExploreMapbox";
import {
  Globe2,
  MapPin, Moon, Clock, Ruler, Sun, ChevronRight, ArrowLeft,
} from "lucide-react";
import { AppBottomNav } from "@/components/ui/AppBottomNav";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/ui/toast";
import type { Profile, Trip, TripCountry } from "@/types";
import { getInitials } from "@/lib/utils";
import { getDrivingRoute } from "@/lib/mapbox/directions";
import { DUSK, FONT_INTER, SUNSET_GRADIENT } from "@/components/design/tokens";
import { COUNTRY_COORDS, ROUTES, type Destination, type Waypoint } from "@/components/explore/explore-routes-data";
import { AMBER_GLOW, AVATAR_GRAD, ExploreMapPlaceholder, TAP, usePageVisible } from "@/components/explore/explore-ui";
import { CountryCard } from "@/components/explore/CountryCard";
import { DiscoverCard } from "@/components/explore/DiscoverCard";
import { EmptyCountries } from "@/components/explore/EmptyCountries";
import { StarField } from "@/components/explore/StarField";

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCountries(d?: string | null) {
  if (!d) return [];
  const m = d.match(/Countries:\s*([^\n]+)/);
  return m ? m[1].split(",").map(s => s.trim()).filter(Boolean) : [];
}
function getTotalNights(trips: Pick<Trip, "start_date"|"end_date">[]) {
  return trips.reduce((acc, t) => {
    if (!t.start_date || !t.end_date) return acc;
    return acc + Math.max(0, Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000));
  }, 0);
}

function getRouteCamera(waypoints: Waypoint[]): ExploreCamera {
  if (waypoints.length === 0) return { lat: 45, lng: 15, altitude: 1.8 };

  const lats = waypoints.map(w => w.lat);
  const lngs = waypoints.map(w => w.lng);
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  // Enleme göre boylam mesafesini düzelt (kuzey/güney rotaları için)
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const effectiveLngSpan = lngSpan * Math.max(cosLat, 0.25);
  const span = Math.max(latSpan, effectiveLngSpan, 0.05);

  // Logaritmik zoom: kısa rota → yakın, uzun rota → uzak
  // globe.gl altitude: düşük = yakın zoom, yüksek = uzak zoom
  const MIN_ALT = 0.44;   // ~50 km rotalar (Amalfi, Cappadocia)
  const MAX_ALT = 0.88;   // ~4000 km rotalar (Route 66)
  const SPAN_FLOOR = 0.10; // bundan küçük rotalar tam yakın zoom
  const SPAN_CEIL  = 26;   // bundan büyük rotalar tam uzak zoom

  let altitude: number;
  if (span <= SPAN_FLOOR) {
    altitude = MIN_ALT;
  } else if (span >= SPAN_CEIL) {
    altitude = MAX_ALT;
  } else {
    const t =
      (Math.log(span) - Math.log(SPAN_FLOOR)) /
      (Math.log(SPAN_CEIL) - Math.log(SPAN_FLOOR));
    altitude = MIN_ALT + t * (MAX_ALT - MIN_ALT);
  }

  return { lat: centerLat, lng: centerLng, altitude };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  profile: Profile | null;
  trips: Pick<Trip, "id"|"title"|"description"|"start_date"|"end_date"|"owner_id"|"countries">[];
}

interface VisitedPlace {
  name: string;
  lat: number;
  lng: number;
}

function collectVisitedPlaces(
  trips: Pick<Trip, "description"|"countries">[],
): VisitedPlace[] {
  const seen = new Set<string>();
  const out: VisitedPlace[] = [];
  for (const t of trips) {
    if (t.countries?.length) {
      for (const c of t.countries as TripCountry[]) {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          out.push({ name: c.name, lat: c.lat, lng: c.lng });
        }
      }
    } else {
      for (const c of parseCountries(t.description)) {
        const co = COUNTRY_COORDS[c];
        if (co && !seen.has(c)) {
          seen.add(c);
          out.push({ name: c, lat: co[0], lng: co[1] });
        }
      }
    }
  }
  return out;
}

export function ExploreClient({ profile, trips }: Props) {
  const [MapComponent, setMapComponent] = useState<typeof import("@/components/explore/ExploreMapbox").ExploreMapbox | null>(null);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const router       = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [ready,         setReady]        = useState(false);
  const [tab,           setTab]          = useState<"visited"|"discover">("visited");
  const [preview,       setPreview]      = useState<Destination | null>(null);
  const [globeW,        setGlobeW]       = useState(390);
  const [globeH,        setGlobeH]       = useState(300);
  const [autoRotate,    setAutoRotate]    = useState(true);
  const reducedMotion = useReducedMotionPreference();
  const pageVisible   = usePageVisible();
  const [camera,        setCamera]        = useState<ExploreCamera | null>(null);
  const [flyToken,      setFlyToken]      = useState(0);

  // mapbox-gl touches browser APIs; request it after hydration so it remains
  // outside the route's initial client graph without changing the map layout.
  useEffect(() => {
    let current = true;
    setMapLoadFailed(false);
    import("@/components/explore/ExploreMapbox")
      .then((module) => { if (current) setMapComponent(() => module.ExploreMapbox); })
      .catch(() => { if (current) setMapLoadFailed(true); });
    return () => { current = false; };
  }, []);
  const [drivingPath,   setDrivingPath]   = useState<{ lat: number; lng: number }[]>([]);

  const visitedPlaces = useMemo(() => collectVisitedPlaces(trips), [trips]);

  const points = useMemo(() => {
    if (preview) {
      const last = preview.waypoints.length - 1;
      const cam = getRouteCamera(preview.waypoints);
      const markerScale = cam.altitude < 0.55 ? 1.35 : cam.altitude < 0.7 ? 1.15 : 1;
      return preview.waypoints.map((wp, i) => ({
        lat: wp.lat,
        lng: wp.lng,
        label: wp.name,
        size: (i === 0 || i === last ? 0.52 : 0.28) * markerScale,
        color: i === 0 ? DUSK.amber : i === last ? "#fb923c" : "#60a5fa",
      }));
    }
    return [
      ...visitedPlaces.map(p => ({
        lat: p.lat, lng: p.lng, label: p.name, size: 0.65, color: DUSK.amber,
      })),
      ...ROUTES.map(d => ({ lat: d.lat, lng: d.lng, label: d.name, size: 0.32, color: "rgba(130,190,255,0.85)" })),
    ];
  }, [visitedPlaces, preview]);

  const routePath = useMemo(() => {
    if (!preview) return [];
    if (drivingPath.length > 1) return drivingPath;
    return preview.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }));
  }, [preview, drivingPath]);

  const arcs = useMemo(() => {
    if (preview) return [];
    if (visitedPlaces.length < 2) return [];
    return Array.from({ length: Math.min(visitedPlaces.length - 1, 6) }, (_, i) => ({
      startLat: visitedPlaces[i].lat,
      startLng: visitedPlaces[i].lng,
      endLat: visitedPlaces[i + 1].lat,
      endLng: visitedPlaces[i + 1].lng,
    }));
  }, [visitedPlaces, preview]);

  useEffect(() => {
    if (!preview || preview.waypoints.length < 2) {
      setDrivingPath([]);
      return;
    }
    let cancelled = false;
    getDrivingRoute(preview.waypoints).then(route => {
      if (!cancelled) setDrivingPath(route?.polylinePath ?? []);
    });
    return () => { cancelled = true; };
  }, [preview]);

  // Size globe to exactly half viewport
  useEffect(() => {
    const update = () => {
      const w = Math.min(window.innerWidth, 430);
      const h = Math.round(window.innerHeight * 0.50);
      setGlobeW(w);
      setGlobeH(h);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // İlk kamera konumu
  useEffect(() => {
    if (!ready || preview) return;
    const first = visitedPlaces[0] ?? null;
    setAutoRotate(true);
    setCamera({ lat: first?.lat ?? 45, lng: first?.lng ?? 15, altitude: 1.8 });
    setFlyToken(t => t + 1);
  }, [ready, visitedPlaces, preview]);

  // "Use this route" — clones the template's waypoints into a real trip.
  const [cloning, setCloning] = useState(false)
  const handleUseRoute = async (d: Destination) => {
    if (cloning) return
    if (!profile?.id) {
      showToast("Sign in to start this trip.", "error")
      return
    }
    setCloning(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc("create_trip_with_stops", {
      p_title: d.name,
      p_description: d.description,
      p_total_budget: 0,
      p_vibe: "Road",
      p_countries: [{ name: d.country, flag: d.emoji, lat: d.lat, lng: d.lng }],
      p_focus_lat: d.waypoints[0]?.lat ?? d.lat,
      p_focus_lng: d.waypoints[0]?.lng ?? d.lng,
      // No `nights` key: a template's waypoints are the cities the route sleeps
      // in, and create_trip_with_stops reads an omitted count as one night
      // (20260808120000_stop_overnight_semantics.sql). Sending an explicit 1
      // would restate that contract in a second place without changing anything,
      // and would then have to be kept in step with it. Turning a stop into a day
      // stop is a decision the traveler makes later, with Plan's 🌙 toggle.
      p_stops: d.waypoints.map((wp, i) => ({
        name: wp.name,
        lat: wp.lat,
        lng: wp.lng,
        order_index: i,
        stop_type: i === 0 ? "origin" : "destination",
      })),
    })
    const tripId = (data as { trip_id?: string } | null)?.trip_id
    if (error || !tripId) {
      showToast(error?.message ?? "Couldn't create the trip.", "error")
      setCloning(false)
      return
    }
    router.push(`/trip/${tripId}/mobile`)
  }

  const openPreview = (d: Destination) => {
    setAutoRotate(false);
    setPreview(d);
    setCamera(getRouteCamera(d.waypoints));
    setFlyToken(t => t + 1);
  };

  const closePreview = () => {
    setPreview(null);
    setAutoRotate(true);
    const first = visitedPlaces[0] ?? null;
    setCamera({ lat: first?.lat ?? 45, lng: first?.lng ?? 15, altitude: 1.8 });
    setFlyToken(t => t + 1);
  };

  const totalNights = getTotalNights(trips);

  return (
    <div
      ref={containerRef}
      style={{ ...FONT_INTER, background: "#000010", height: "100svh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {/* Ambient orbs */}
      <div style={{ position:"absolute", top:"20%", left:"10%", width:300, height:300, borderRadius:"50%", background:"rgba(245,100,0,0.07)", filter:"blur(100px)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", top:"5%",  right:"5%", width:180, height:180, borderRadius:"50%", background:"rgba(80,50,220,0.09)",  filter:"blur(80px)",  pointerEvents:"none" }} />

      {/* ── TOP HALF: Mapbox globe ── */}
      <div style={{ width: "100%", height: globeH, flexShrink: 0, position: "relative", overflow: "hidden" }}>
        <StarField />

        {/* Floating header */}
        <motion.div
          style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "48px 20px 0" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
        >
          <div>
            <p style={{ fontSize: 20, fontWeight: 800, color: DUSK.textPrimary, margin: 0, letterSpacing: -0.3 }}>
              {preview ? preview.name : "Explore"}
            </p>
            <p style={{ fontSize: 11, color: "rgba(200,210,255,0.45)", margin: 0 }}>
              {preview ? preview.country : `${visitedPlaces.length} countr${visitedPlaces.length !== 1 ? "ies" : "y"} visited`}
            </p>
          </div>
          <motion.button
            onClick={() => router.push("/profile")}
            style={{ width: 36, height: 36, borderRadius: "50%", background: AVATAR_GRAD, border: `2px solid ${DUSK.amber}`, boxShadow: AMBER_GLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: DUSK.textPrimary, cursor: "pointer", padding: 0 }}
            whileTap={{ scale: 0.86 }} transition={TAP}
          >
            {getInitials(profile?.display_name ?? profile?.email)}
          </motion.button>
        </motion.div>

        {/* Mapbox globe */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <DeferredBoundary label="the interactive globe" style={{ width: "100%", height: "100%" }}>
            {mapLoadFailed ? (
              <DeferredFailure label="the interactive globe" onRetry={() => window.location.reload()} style={{ width: "100%", height: "100%" }} />
            ) : MapComponent ? (
                <MapComponent
                  width={globeW}
                  height={globeH}
                  points={points}
                  arcs={arcs}
                  routePath={routePath}
                  autoRotate={autoRotate && pageVisible && !reducedMotion}
                  camera={camera}
                  flyToken={flyToken}
                  onReady={() => setReady(true)}
                  onUserInteract={() => setAutoRotate(false)}
                />
            ) : <ExploreMapPlaceholder />}
          </DeferredBoundary>
        </div>

        {/* Loading ring */}
        <AnimatePresence>
          {!ready && (
            <motion.div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#000010", zIndex:5 }}
              exit={{ opacity:0 }} transition={{ duration:0.6 }}
            >
              <motion.div style={{ width:120, height:120, borderRadius:"50%", border:"2px solid rgba(245,166,35,0.28)", display:"flex", alignItems:"center", justifyContent:"center" }}
                animate={{ rotate:360 }} transition={{ duration:4, repeat:Infinity, ease:"linear" }}
              >
                <Globe2 style={{ width:48, height:48, color:"rgba(245,166,35,0.55)" }} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom fade into lower half */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:80, background:"linear-gradient(to bottom, transparent, #000010)", pointerEvents:"none" }} />

        {/* Preview route label badge on globe */}
        <AnimatePresence>
          {preview && (
            <motion.div
              style={{ position:"absolute", bottom:14, left:"50%", transform:"translateX(-50%)", background:"rgba(245,166,35,0.92)", borderRadius:20, padding:"5px 16px", fontSize:12, fontWeight:700, color: DUSK.onAmber, zIndex:10, whiteSpace:"nowrap", ...FONT_INTER }}
              initial={{ opacity:0, y:8, scale:0.9 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, scale:0.9 }} transition={TAP}
            >
              📍 {preview.name} · {preview.country}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM HALF ── */}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
        <AnimatePresence mode="wait">

          {/* ── Default: stats + tabs + cards ── */}
          {!preview && (
            <motion.div
              key="default"
              style={{ position:"absolute", inset:0, overflowY:"auto", display:"flex", flexDirection:"column" }}
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:20 }}
              transition={{ duration:0.22 }}
            >
              {/* Stats */}
              <div style={{ display:"flex", margin:"12px 16px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, overflow:"hidden", backdropFilter:"blur(16px)", flexShrink:0 }}>
                {[
                  { Icon: Globe2, value: visitedPlaces.length, label: "Countries" },
                  { Icon: MapPin, value: trips.length,            label: "Trips"     },
                  { Icon: Moon,   value: totalNights,             label: "Nights"    },
                ].map(({ Icon, value, label }, i) => (
                  <div key={label} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 4px", borderRight: i < 2 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                    <Icon style={{ width:14, height:14, color: DUSK.amber, marginBottom:4 }} />
                    <span style={{ fontSize:19, fontWeight:800, color: DUSK.textPrimary, lineHeight:1 }}>{value}</span>
                    <span style={{ fontSize:10, color:"rgba(200,210,255,0.40)", marginTop:2 }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display:"flex", gap:8, padding:"0 16px 10px", flexShrink:0 }}>
                {(["visited","discover"] as const).map(t => (
                  <motion.button key={t} onClick={() => setTab(t)}
                    style={{ flex:1, padding:"8px 0", borderRadius:12, background: tab===t ? SUNSET_GRADIENT : "rgba(255,255,255,0.06)", border:`1px solid ${tab===t ? "transparent" : "rgba(255,255,255,0.10)"}`, color: tab===t ? DUSK.onAmber : "rgba(200,210,255,0.65)", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow: tab===t ? AMBER_GLOW : "none", ...FONT_INTER }}
                    whileTap={{ scale:0.95 }} transition={TAP}
                  >
                    {t === "visited" ? "My Countries" : "Discover"}
                  </motion.button>
                ))}
              </div>

              {/* Cards */}
              <div style={{ flex:1, padding:"0 16px 100px", overflowY:"auto" }}>
                <AnimatePresence mode="wait">
                  {tab === "visited" ? (
                    <motion.div key="v" initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:10 }} transition={{ duration:0.15 }}>
                      {visitedPlaces.length === 0 ? (
                        <EmptyCountries onDiscover={() => setTab("discover")} />
                      ) : (
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          {visitedPlaces.map((p, i) => <CountryCard key={p.name} name={p.name} lat={p.lat} lng={p.lng} index={i} />)}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key="d" initial={{ opacity:0, x:10 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-10 }} transition={{ duration:0.15 }}>
                      <p style={{ fontSize:10, fontWeight:600, color:"rgba(200,210,255,0.35)", letterSpacing:"0.08em", margin:"0 0 10px" }}>RECOMMENDED ROUTES</p>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {ROUTES.map((d,i) => (
                          <DiscoverCard key={d.name} dest={d} index={i} onPress={() => openPreview(d)} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── Preview: route details ── */}
          {preview && (
            <motion.div
              key="preview"
              style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", background:"rgba(6,6,24,0.98)", borderTop:"1px solid rgba(255,255,255,0.10)" }}
              initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
              transition={{ type:"spring", stiffness:340, damping:36 }}
            >
              {/* Preview header bar */}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px 8px", flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                <motion.button onClick={closePreview}
                  style={{ width:32, height:32, borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", padding:0, flexShrink:0 }}
                  whileTap={{ scale:0.86 }} transition={TAP}
                >
                  <ArrowLeft style={{ width:16, height:16, color:"rgba(200,210,255,0.70)" }} />
                </motion.button>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:15, fontWeight:700, color: DUSK.textPrimary, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{preview.name}</p>
                  <p style={{ fontSize:11, color:"rgba(200,210,255,0.45)", margin:0 }}>{preview.country} · {preview.tag}</p>
                </div>
                <span style={{ fontSize: 22 }}>{preview.emoji}</span>
              </div>

              {/* Scrollable content */}
              <div style={{ flex:1, overflowY:"auto", padding:"14px 16px 100px" }}>

                {/* Stats */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
                  {[
                    { Icon: Ruler, label:"Distance",    value: preview.distance    },
                    { Icon: Clock, label:"Duration",    value: preview.duration    },
                    { Icon: Sun,   label:"Best Season", value: preview.bestSeason  },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                      <Icon style={{ width:13, height:13, color: DUSK.amber, marginBottom:5 }} />
                      <p style={{ fontSize:12, fontWeight:700, color: DUSK.textPrimary, margin:"0 0 2px", lineHeight:1.2 }}>{value}</p>
                      <p style={{ fontSize:9, color:"rgba(200,210,255,0.38)", margin:0 }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* Description */}
                <p style={{ fontSize:13, color:"rgba(200,210,255,0.75)", lineHeight:1.65, margin:"0 0 16px" }}>
                  {preview.description}
                </p>

                {/* Waypoints */}
                <p style={{ fontSize:10, fontWeight:600, color:"rgba(200,210,255,0.35)", letterSpacing:"0.08em", margin:"0 0 10px" }}>ROUTE</p>
                <div style={{ display:"flex", alignItems:"flex-start", gap:0, marginBottom:16, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
                  {preview.waypoints.map((wp, i) => (
                    <div key={wp.name} style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        <div style={{ width:26, height:26, borderRadius:"50%", background: i===0||i===preview.waypoints.length-1 ? SUNSET_GRADIENT : "rgba(255,255,255,0.10)", border: i===0||i===preview.waypoints.length-1 ? "none" : "1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow: i===0||i===preview.waypoints.length-1 ? AMBER_GLOW : "none", flexShrink:0 }}>
                          <MapPin style={{ width:11, height:11, color: i===0||i===preview.waypoints.length-1 ? DUSK.onAmber : "rgba(200,210,255,0.55)" }} />
                        </div>
                        <p style={{ fontSize:9, fontWeight:600, color: i===0||i===preview.waypoints.length-1 ? DUSK.amber : "rgba(200,210,255,0.50)", margin:0, whiteSpace:"nowrap", maxWidth:56, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis" }}>{wp.name}</p>
                      </div>
                      {i < preview.waypoints.length-1 && (
                        <div style={{ width:20, height:1, background:"rgba(255,255,255,0.14)", margin:"0 1px", marginBottom:18, flexShrink:0 }} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Highlights */}
                <p style={{ fontSize:10, fontWeight:600, color:"rgba(200,210,255,0.35)", letterSpacing:"0.08em", margin:"0 0 10px" }}>HIGHLIGHTS</p>
                <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:20 }}>
                  {preview.highlights.map((h, i) => (
                    <motion.div key={h}
                      style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"9px 12px" }}
                      initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.05+i*0.05 }}
                    >
                      <span style={{ fontSize:14 }}>{["✨","🎯","🌟","🔥"][i%4]}</span>
                      <span style={{ fontSize:12, color:DUSK.textSecondary, flex:1 }}>{h}</span>
                      <ChevronRight style={{ width:13, height:13, color:"rgba(200,210,255,0.22)", flexShrink:0 }} />
                    </motion.div>
                  ))}
                </div>

                {/* CTA */}
                <motion.button
                  onClick={() => handleUseRoute(preview)}
                  disabled={cloning}
                  style={{ width:"100%", background:SUNSET_GRADIENT, color: DUSK.onAmber, fontWeight:800, fontSize:15, border:"none", borderRadius:14, padding:"14px", boxShadow:AMBER_GLOW, cursor: cloning ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity: cloning ? 0.6 : 1, ...FONT_INTER }}
                  whileTap={{ scale:0.97 }} whileHover={{ scale:1.01 }} transition={TAP}
                >
                  <MapPin style={{ width:16, height:16 }} />
                  {cloning ? "Creating your trip…" : "Use This Route"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Nav */}
      <AppBottomNav active="explore" profile={profile} />
    </div>
  );
}
