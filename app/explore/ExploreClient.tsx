"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import type { ExploreCamera } from "@/components/explore/ExploreMapbox";
import {
  Compass, Globe2,
  MapPin, Moon, Clock, Ruler, Sun, ChevronRight, ArrowLeft,
} from "lucide-react";
import { AppBottomNav } from "@/components/ui/AppBottomNav";
import { createClient } from "@/lib/supabase/client";
import { showToast, Toaster } from "@/components/ui/toast";
import type { Profile, Trip, TripCountry } from "@/types";
import { getInitials } from "@/lib/utils";
import { getDrivingRoute } from "@/lib/mapbox/directions";

const ExploreMapbox = dynamic(
  () => import("@/components/explore/ExploreMapbox").then(m => m.ExploreMapbox),
  { ssr: false },
);

// ── Tokens ────────────────────────────────────────────────────────────────────
const FONT: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
};
const AMBER_GRAD  = "linear-gradient(135deg, #f5a623, #f8c04a)";
const AMBER_GLOW  = "0 0 20px rgba(245,140,0,0.30)";
const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";
const TAP = { type: "spring" as const, stiffness: 420, damping: 22 };

const COUNTRY_COLORS = [
  "linear-gradient(135deg,#0d9488,#0284c7)",
  "linear-gradient(135deg,#b45309,#f59e0b)",
  "linear-gradient(135deg,#374151,#0f766e)",
  "linear-gradient(135deg,#7c3aed,#4f46e5)",
  "linear-gradient(135deg,#065f46,#0369a1)",
  "linear-gradient(135deg,#be185d,#7c3aed)",
];

// ── Data ──────────────────────────────────────────────────────────────────────
const COUNTRY_COORDS: Record<string, [number, number]> = {
  "Turkey": [39.9, 32.9], "Türkiye": [39.9, 32.9],
  "Italy": [41.9, 12.5], "France": [46.2, 2.2], "Spain": [40.4, -3.7],
  "Germany": [51.2, 10.4], "UK": [55.4, -3.4], "United Kingdom": [55.4, -3.4],
  "Portugal": [39.4, -8.2], "Greece": [39.1, 21.8], "Netherlands": [52.1, 5.3],
  "Belgium": [50.5, 4.5], "Switzerland": [46.8, 8.2], "Austria": [47.5, 14.6],
  "Poland": [51.9, 19.1], "Czech Republic": [49.8, 15.5], "Hungary": [47.2, 19.5],
  "Croatia": [45.1, 15.2], "Romania": [45.9, 24.9], "Bulgaria": [42.7, 25.5],
  "Serbia": [44.0, 21.0], "Sweden": [60.1, 18.6], "Norway": [60.5, 8.5],
  "Denmark": [56.3, 9.5], "Finland": [61.9, 25.7], "Iceland": [64.9, -18.2],
  "USA": [37.1, -95.7], "United States": [37.1, -95.7], "Canada": [56.1, -106.3],
  "Mexico": [23.6, -102.6], "Brazil": [-14.2, -51.9], "Argentina": [-38.4, -63.6],
  "Japan": [36.2, 138.3], "South Korea": [35.9, 127.8], "China": [35.9, 104.2],
  "Thailand": [15.9, 100.9], "Vietnam": [14.1, 108.3], "Indonesia": [-0.8, 113.9],
  "Singapore": [1.4, 103.8], "India": [20.6, 78.9], "Nepal": [28.4, 84.1],
  "UAE": [23.4, 53.8], "Morocco": [31.8, -7.1], "Egypt": [26.8, 30.8],
  "South Africa": [-30.6, 22.9], "Kenya": [0.0, 37.9],
  "Australia": [-25.3, 133.8], "New Zealand": [-40.9, 174.9],
  "Russia": [61.5, 105.3], "Georgia": [42.3, 43.4],
};

interface Waypoint {
  name: string;
  lat: number;
  lng: number;
}

interface Destination {
  name: string; country: string; lat: number; lng: number;
  emoji: string; tag: string; distance: string; duration: string;
  bestSeason: string; description: string;
  highlights: string[]; waypoints: Waypoint[];
}

const ROUTES: Destination[] = [
  {
    name: "Amalfi Coast", country: "Italy", lat: 40.6, lng: 14.6, emoji: "🏛️", tag: "Coastal Drive",
    distance: "50 km", duration: "2–3 days", bestSeason: "May – Oct",
    description: "A winding clifftop road above turquoise waters, connecting pastel villages and hidden sea grottos.",
    highlights: ["Positano cliffside village", "Ravello garden terraces", "Path of the Gods trail", "Grotta dello Smeraldo"],
    waypoints: [
      { name: "Sorrento", lat: 40.626, lng: 14.375 },
      { name: "Positano", lat: 40.628, lng: 14.485 },
      { name: "Amalfi", lat: 40.634, lng: 14.603 },
      { name: "Ravello", lat: 40.649, lng: 14.612 },
      { name: "Salerno", lat: 40.683, lng: 14.768 },
    ],
  },
  {
    name: "Ring Road", country: "Iceland", lat: 65.0, lng: -18.0, emoji: "🌋", tag: "Epic Route",
    distance: "1.332 km", duration: "7–14 days", bestSeason: "Jun – Aug",
    description: "Iceland's Route 1 circles the entire island, passing glaciers, volcanoes, waterfalls, and Northern Lights.",
    highlights: ["Jökulsárlón glacier lagoon", "Skaftafell ice caves", "Mývatn geothermal lakes", "Dettifoss waterfall"],
    waypoints: [
      { name: "Reykjavík", lat: 64.146, lng: -21.942 },
      { name: "Vík", lat: 63.419, lng: -19.007 },
      { name: "Höfn", lat: 64.253, lng: -15.212 },
      { name: "Egilsstaðir", lat: 65.263, lng: -14.394 },
      { name: "Akureyri", lat: 65.684, lng: -18.088 },
      { name: "Borgarnes", lat: 64.537, lng: -21.921 },
    ],
  },
  {
    name: "Route 66", country: "USA", lat: 35.5, lng: -96.0, emoji: "🛣️", tag: "Legendary Road",
    distance: "3.940 km", duration: "14–21 days", bestSeason: "Apr – Oct",
    description: "The Mother Road stretches from Chicago to LA through neon diners, vast deserts, and Americana.",
    highlights: ["Cadillac Ranch, Amarillo", "Petrified Forest NP", "Grand Canyon detour", "Santa Monica Pier"],
    waypoints: [
      { name: "Chicago", lat: 41.878, lng: -87.630 },
      { name: "St. Louis", lat: 38.627, lng: -90.199 },
      { name: "Oklahoma City", lat: 35.468, lng: -97.516 },
      { name: "Albuquerque", lat: 35.085, lng: -106.651 },
      { name: "Flagstaff", lat: 35.199, lng: -111.651 },
      { name: "Los Angeles", lat: 34.052, lng: -118.244 },
    ],
  },
  {
    name: "Milford Sound", country: "New Zealand", lat: -44.7, lng: 167.9, emoji: "🏔️", tag: "Scenic Wonder",
    distance: "120 km", duration: "2–3 days", bestSeason: "Nov – Mar",
    description: "A dramatic fjord carved by glaciers, surrounded by sheer peaks and thundering waterfalls.",
    highlights: ["Mitre Peak reflection", "Stirling & Lady Bowen Falls", "Milford Track hike", "Underwater Observatory"],
    waypoints: [
      { name: "Queenstown", lat: -45.031, lng: 168.663 },
      { name: "Te Anau", lat: -45.415, lng: 167.719 },
      { name: "Cascade Creek", lat: -44.833, lng: 168.117 },
      { name: "Milford Sound", lat: -44.617, lng: 167.897 },
    ],
  },
  {
    name: "Trollstigen", country: "Norway", lat: 62.5, lng: 7.7, emoji: "🌊", tag: "Mountain Pass",
    distance: "106 km", duration: "1–2 days", bestSeason: "Jun – Sep",
    description: "Eleven hairpin bends climb a sheer wall with views of cascading waterfalls and deep Norwegian valleys.",
    highlights: ["11 hairpin bends", "Stigfossen 320 m waterfall", "Eagle Road viewpoint", "Geirangerfjord detour"],
    waypoints: [
      { name: "Åndalsnes", lat: 62.567, lng: 7.687 },
      { name: "Trollstigen Pass", lat: 62.472, lng: 7.662 },
      { name: "Valldal", lat: 62.299, lng: 7.357 },
      { name: "Geiranger", lat: 62.101, lng: 7.206 },
    ],
  },
  {
    name: "Cappadocia", country: "Turkey", lat: 38.6, lng: 34.8, emoji: "🎈", tag: "Hidden Gem",
    distance: "180 km", duration: "3–4 days", bestSeason: "Apr – Jun",
    description: "Fairy chimneys, underground cities, and sunrise hot-air balloons over a surreal volcanic landscape.",
    highlights: ["Hot-air balloon at sunrise", "Göreme Open-Air Museum", "Derinkuyu underground city", "Rose Valley hike"],
    waypoints: [
      { name: "Nevşehir", lat: 38.624, lng: 34.715 },
      { name: "Göreme", lat: 38.644, lng: 34.829 },
      { name: "Ürgüp", lat: 38.628, lng: 34.911 },
      { name: "Avanos", lat: 38.716, lng: 34.847 },
      { name: "Derinkuyu", lat: 38.374, lng: 34.734 },
    ],
  },
];

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
  const router       = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [ready,         setReady]        = useState(false);
  const [tab,           setTab]          = useState<"visited"|"discover">("visited");
  const [preview,       setPreview]      = useState<Destination | null>(null);
  const [globeW,        setGlobeW]       = useState(390);
  const [globeH,        setGlobeH]       = useState(300);
  const [autoRotate,    setAutoRotate]    = useState(true);
  const [camera,        setCamera]        = useState<ExploreCamera | null>(null);
  const [flyToken,      setFlyToken]      = useState(0);
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
        color: i === 0 ? "#f5a623" : i === last ? "#fb923c" : "#60a5fa",
      }));
    }
    return [
      ...visitedPlaces.map(p => ({
        lat: p.lat, lng: p.lng, label: p.name, size: 0.65, color: "#f5a623",
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
      style={{ ...FONT, background: "#000010", height: "100svh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}
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
            <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: -0.3 }}>
              {preview ? preview.name : "Explore"}
            </p>
            <p style={{ fontSize: 11, color: "rgba(200,210,255,0.45)", margin: 0 }}>
              {preview ? preview.country : `${visitedPlaces.length} countr${visitedPlaces.length !== 1 ? "ies" : "y"} visited`}
            </p>
          </div>
          <motion.button
            onClick={() => router.push("/profile")}
            style={{ width: 36, height: 36, borderRadius: "50%", background: AVATAR_GRAD, border: "2px solid #f5a623", boxShadow: AMBER_GLOW, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", padding: 0 }}
            whileTap={{ scale: 0.86 }} transition={TAP}
          >
            {getInitials(profile?.display_name ?? profile?.email)}
          </motion.button>
        </motion.div>

        {/* Mapbox globe */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ExploreMapbox
            width={globeW}
            height={globeH}
            points={points}
            arcs={arcs}
            routePath={routePath}
            autoRotate={autoRotate}
            camera={camera}
            flyToken={flyToken}
            onReady={() => setReady(true)}
            onUserInteract={() => setAutoRotate(false)}
          />
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
              style={{ position:"absolute", bottom:14, left:"50%", transform:"translateX(-50%)", background:"rgba(245,166,35,0.92)", borderRadius:20, padding:"5px 16px", fontSize:12, fontWeight:700, color:"#1a0800", zIndex:10, whiteSpace:"nowrap", ...FONT }}
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
                    <Icon style={{ width:14, height:14, color:"#f5a623", marginBottom:4 }} />
                    <span style={{ fontSize:19, fontWeight:800, color:"#fff", lineHeight:1 }}>{value}</span>
                    <span style={{ fontSize:10, color:"rgba(200,210,255,0.40)", marginTop:2 }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display:"flex", gap:8, padding:"0 16px 10px", flexShrink:0 }}>
                {(["visited","discover"] as const).map(t => (
                  <motion.button key={t} onClick={() => setTab(t)}
                    style={{ flex:1, padding:"8px 0", borderRadius:12, background: tab===t ? AMBER_GRAD : "rgba(255,255,255,0.06)", border:`1px solid ${tab===t ? "transparent" : "rgba(255,255,255,0.10)"}`, color: tab===t ? "#1a0800" : "rgba(200,210,255,0.65)", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow: tab===t ? AMBER_GLOW : "none", ...FONT }}
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
                  <p style={{ fontSize:15, fontWeight:700, color:"#fff", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{preview.name}</p>
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
                      <Icon style={{ width:13, height:13, color:"#f5a623", marginBottom:5 }} />
                      <p style={{ fontSize:12, fontWeight:700, color:"#fff", margin:"0 0 2px", lineHeight:1.2 }}>{value}</p>
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
                        <div style={{ width:26, height:26, borderRadius:"50%", background: i===0||i===preview.waypoints.length-1 ? AMBER_GRAD : "rgba(255,255,255,0.10)", border: i===0||i===preview.waypoints.length-1 ? "none" : "1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow: i===0||i===preview.waypoints.length-1 ? AMBER_GLOW : "none", flexShrink:0 }}>
                          <MapPin style={{ width:11, height:11, color: i===0||i===preview.waypoints.length-1 ? "#1a0800" : "rgba(200,210,255,0.55)" }} />
                        </div>
                        <p style={{ fontSize:9, fontWeight:600, color: i===0||i===preview.waypoints.length-1 ? "#f5a623" : "rgba(200,210,255,0.50)", margin:0, whiteSpace:"nowrap", maxWidth:56, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis" }}>{wp.name}</p>
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
                      <span style={{ fontSize:12, color:"rgba(215,215,255,0.82)", flex:1 }}>{h}</span>
                      <ChevronRight style={{ width:13, height:13, color:"rgba(200,210,255,0.22)", flexShrink:0 }} />
                    </motion.div>
                  ))}
                </div>

                {/* CTA */}
                <motion.button
                  onClick={() => handleUseRoute(preview)}
                  disabled={cloning}
                  style={{ width:"100%", background:AMBER_GRAD, color:"#1a0800", fontWeight:800, fontSize:15, border:"none", borderRadius:14, padding:"14px", boxShadow:AMBER_GLOW, cursor: cloning ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity: cloning ? 0.6 : 1, ...FONT }}
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
      <Toaster />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function CountryCard({ name, lat, lng, index }: { name: string; lat: number; lng: number; index: number }) {
  return (
    <motion.div
      style={{ background:COUNTRY_COLORS[index%COUNTRY_COLORS.length], borderRadius:16, padding:"16px 12px", position:"relative", overflow:"hidden", minHeight:90, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
      whileTap={{ scale:0.96 }} transition={TAP}
    >
      <div style={{ position:"absolute", top:8, right:8, fontSize:9, fontWeight:700, background:"rgba(0,0,0,0.32)", color:"#f5a623", borderRadius:20, padding:"2px 7px", letterSpacing:"0.06em" }}>VISITED</div>
      <MapPin style={{ width:14, height:14, color:"rgba(255,255,255,0.65)", marginBottom:5 }} />
      <p style={{ fontSize:14, fontWeight:700, color:"#fff", margin:0 }}>{name}</p>
      <p style={{ fontSize:9, color:"rgba(255,255,255,0.40)", margin:"2px 0 0", fontFamily:"monospace" }}>{lat.toFixed(1)}° {lng.toFixed(1)}°</p>
    </motion.div>
  );
}

function DiscoverCard({ dest, index, onPress }: { dest: Destination; index: number; onPress: () => void }) {
  return (
    <motion.button onClick={onPress}
      style={{ width:"100%", display:"flex", alignItems:"center", gap:12, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, backdropFilter:"blur(16px)", padding:"12px 14px", cursor:"pointer", textAlign:"left" }}
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.05 }}
      whileTap={{ scale:0.97 }} whileHover={{ background:"rgba(255,255,255,0.08)" }}
    >
      <div style={{ width:46, height:46, borderRadius:12, background:COUNTRY_COLORS[index%COUNTRY_COLORS.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{dest.emoji}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:700, color:"#fff", margin:"0 0 1px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{dest.name}</p>
        <p style={{ fontSize:11, color:"rgba(200,210,255,0.45)", margin:"0 0 5px" }}>{dest.country}</p>
        <span style={{ fontSize:10, fontWeight:600, color:"#f5a623", background:"rgba(245,166,35,0.12)", border:"1px solid rgba(245,166,35,0.25)", borderRadius:20, padding:"2px 8px" }}>{dest.tag}</span>
      </div>
      <Compass style={{ width:16, height:16, color:"rgba(200,210,255,0.25)", flexShrink:0 }} />
    </motion.button>
  );
}

function EmptyCountries({ onDiscover }: { onDiscover: () => void }) {
  return (
    <motion.div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:18, padding:"36px 20px", textAlign:"center" }}
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
    >
      <p style={{ fontSize:36, margin:"0 0 12px" }}>🌍</p>
      <p style={{ color:"#fff", fontWeight:600, fontSize:15, margin:"0 0 6px" }}>No countries yet</p>
      <p style={{ color:"rgba(200,210,255,0.50)", fontSize:12, margin:"0 0 20px", lineHeight:1.6 }}>Add countries to your trips and they&apos;ll appear on the map.</p>
      <motion.button onClick={onDiscover}
        style={{ background:AMBER_GRAD, color:"#1a0800", fontWeight:700, fontSize:13, border:"none", borderRadius:12, padding:"10px 22px", boxShadow:AMBER_GLOW, cursor:"pointer", fontFamily:"var(--font-inter),'Inter',system-ui" }}
        whileTap={{ scale:0.94 }} transition={TAP}
      >Discover Routes</motion.button>
    </motion.div>
  );
}

function StarField() {
  const stars = useMemo(() => Array.from({ length:60 }, (_, i) => ({
    id: i, x: Math.random()*100, y: Math.random()*100,
    size: Math.random()*1.5+0.4, delay: Math.random()*5, duration: Math.random()*3+2,
  })), []);
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      {stars.map(s => (
        <motion.div key={s.id}
          style={{ position:"absolute", left:`${s.x}%`, top:`${s.y}%`, width:s.size, height:s.size, borderRadius:"50%", background:"#fff" }}
          animate={{ opacity:[0.08,0.85,0.08] }}
          transition={{ duration:s.duration, delay:s.delay, repeat:Infinity, ease:"easeInOut" }}
        />
      ))}
    </div>
  );
}
