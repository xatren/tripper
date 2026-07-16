"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MoreVertical, Ticket, Trash2, Briefcase, Plus, X } from "lucide-react";
import type { Profile, Trip, TripCapabilities } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate, getInitials } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppBottomNav } from "@/components/ui/AppBottomNav";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG          = "linear-gradient(145deg, #06061c 0%, #0a1020 55%, #071216 100%)";
const AMBER_GRAD  = "linear-gradient(135deg, #f5a623, #f8c04a)";
const AMBER_GLOW  = "0 0 20px rgba(245,140,0,0.28)";
const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";
const FONT: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
};
const TAP = { type: "spring" as const, stiffness: 420, damping: 22 };

const CARD_GRADIENTS = [
  "linear-gradient(135deg, #0d9488, #0284c7, #4338ca)",
  "linear-gradient(135deg, #b45309, #f59e0b, #e11d48)",
  "linear-gradient(135deg, #374151, #1e293b, #0f766e)",
  "linear-gradient(135deg, #7c3aed, #4f46e5, #0284c7)",
  "linear-gradient(135deg, #065f46, #0d9488, #0369a1)",
];
const CARD_EMOJIS = ["🗺️", "🌊", "🏰", "🏔️", "🏝️", "🎭", "🌄", "🏛️"];
// Vibe picked in the New Trip wizard (trips.vibe, migration 008).
const VIBE_EMOJIS: Record<string, string> = {
  Road: "🚗", Fly: "✈️", Camp: "⛺", Beach: "🏖️", Mountain: "🏔️", Backpack: "🎒",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type FilterTab  = "all" | "upcoming" | "ongoing" | "completed";
type TripStatus = "upcoming" | "ongoing" | "completed" | "nodates";

interface Props { profile: Profile | null; trips: Trip[]; capabilitiesByTripId: Record<string, TripCapabilities>; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

function getStatus(trip: Trip): TripStatus {
  if (!trip.start_date) return "nodates";
  const start = new Date(trip.start_date); start.setHours(0, 0, 0, 0);
  const end   = trip.end_date ? new Date(trip.end_date) : null;
  if (end) end.setHours(0, 0, 0, 0);
  if (start > TODAY) return "upcoming";
  if (end && end < TODAY) return "completed";
  return "ongoing";
}

function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr); t.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - TODAY.getTime()) / 86_400_000);
}

function getNights(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
}

function getStatusBadge(trip: Trip) {
  const status = getStatus(trip);
  const days   = getDaysUntil(trip.start_date);
  if (status === "ongoing")   return { label: "Live", color: "#f5a623",        bg: "rgba(245,166,35,0.15)",  border: "rgba(245,166,35,0.35)",  pulse: true  };
  if (status === "upcoming" && days !== null)
                              return { label: days === 0 ? "Departing today!" : `In ${days} day${days !== 1 ? "s" : ""}`, color: "rgb(52,211,153)", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.22)", pulse: false };
  if (status === "completed") return { label: "✓ Completed", color: "rgba(215,215,255,0.45)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.09)", pulse: false };
  return null;
}

function orb(p: { top?: string; bottom?: string; left?: string; right?: string; translate?: string; w: number; h: number; color: string; blur: number }): React.CSSProperties {
  return {
    position: "absolute",
    ...(p.top     !== undefined && { top:    p.top     }),
    ...(p.bottom  !== undefined && { bottom: p.bottom  }),
    ...(p.left    !== undefined && { left:   p.left    }),
    ...(p.right   !== undefined && { right:  p.right   }),
    ...(p.translate !== undefined && { translate: p.translate }),
    width: p.w, height: p.h, borderRadius: "50%",
    background: p.color, filter: `blur(${p.blur}px)`, pointerEvents: "none",
  };
}

// ── Config ────────────────────────────────────────────────────────────────────
const TABS: { id: FilterTab; label: string }[] = [
  { id: "all",       label: "All"       },
  { id: "upcoming",  label: "Upcoming"  },
  { id: "ongoing",   label: "Ongoing"   },
  { id: "completed", label: "Completed" },
];

const EMPTY_COPY: Record<FilterTab, { emoji: string; title: string; sub: string }> = {
  all:       { emoji: "🗺️", title: "No trips yet",      sub: "Head to Home to create your first adventure."  },
  upcoming:  { emoji: "📅", title: "Nothing upcoming",   sub: "Plan your next trip and it'll show up here."   },
  ongoing:   { emoji: "✈️", title: "No active trips",    sub: "Your current journeys will appear here."       },
  completed: { emoji: "🏁", title: "No completed trips", sub: "Finish a trip and it'll live here as a memory." },
};

// ── Main ──────────────────────────────────────────────────────────────────────
export function TripsClient({ profile, trips: initialTrips, capabilitiesByTripId }: Props) {
  const [trips,      setTrips]  = useState<Trip[]>(initialTrips);
  const [tab,        setTab]    = useState<FilterTab>("all");
  const [query,      setQuery]  = useState("");
  const [searching,  setSearch] = useState(false);
  const router   = useRouter();
  const supabase = createClient();

  const counts = useMemo(() => ({
    all:       trips.length,
    upcoming:  trips.filter(t => { const s = getStatus(t); return s === "upcoming" || s === "nodates"; }).length,
    ongoing:   trips.filter(t => getStatus(t) === "ongoing").length,
    completed: trips.filter(t => getStatus(t) === "completed").length,
  }), [trips]);

  const visible = useMemo(() => {
    let list = trips;
    if (tab === "upcoming")  list = list.filter(t => { const s = getStatus(t); return s === "upcoming" || s === "nodates"; });
    if (tab === "ongoing")   list = list.filter(t => getStatus(t) === "ongoing");
    if (tab === "completed") list = list.filter(t => getStatus(t) === "completed");
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q));
    }
    return list;
  }, [trips, tab, query]);

  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);

  const handleDelete = async (tripId: string) => {
    if (!capabilitiesByTripId[tripId]?.canManageTrip) return;
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) { showToast("Couldn't delete the trip. Please try again.", "error"); return; }
    setTrips(t => t.filter(tr => tr.id !== tripId));
  };

  const toggleSearch = () => {
    setSearch(s => !s);
    if (searching) setQuery("");
  };

  return (
    <div style={{ ...FONT, background: BG, minHeight: "100svh", position: "relative", overflow: "hidden" }}>
      {/* Orbs */}
      <div style={orb({ top: "2%",  left: "50%", translate: "-50% 0", w: 380, h: 380, color: "rgba(245,166,35,0.22)", blur: 90 })} />
      <div style={orb({ bottom: "22%", left: "-12%",                  w: 280, h: 280, color: "rgba(120,50,220,0.18)",  blur: 80 })} />
      <div style={orb({ top: "48%", right: "-10%",                    w: 240, h: 240, color: "rgba(20,210,190,0.14)",  blur: 80 })} />

      <div style={{ position: "relative", zIndex: 10, maxWidth: 430, margin: "0 auto", minHeight: "100svh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <motion.header
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 12px" }}
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: AMBER_GRAD, boxShadow: AMBER_GLOW, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Briefcase style={{ width: 21, height: 21, color: "#1a0800" }} />
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: -0.3 }}>My Trips</p>
              <p style={{ fontSize: 12, color: "rgba(215,215,255,0.50)", margin: 0 }}>
                {counts.all} trip{counts.all !== 1 ? "s" : ""} total
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <motion.button
              onClick={toggleSearch}
              style={{ width: 38, height: 38, borderRadius: 10, background: searching ? "rgba(245,166,35,0.15)" : "rgba(255,255,255,0.07)", border: `1px solid ${searching ? "rgba(245,166,35,0.35)" : "rgba(255,255,255,0.10)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, transition: "all 0.2s" }}
              whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.08 }} transition={TAP}
            >
              {searching
                ? <X     style={{ width: 17, height: 17, color: "#f5a623" }} />
                : <Search style={{ width: 17, height: 17, color: "rgba(215,215,255,0.65)" }} />}
            </motion.button>

            <motion.button
              onClick={() => router.push("/profile")}
              style={{ width: 38, height: 38, borderRadius: "50%", background: AVATAR_GRAD, border: "2px solid #f5a623", boxShadow: "0 0 14px rgba(245,140,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", padding: 0 }}
              whileTap={{ scale: 0.86 }} transition={TAP}
            >
              {getInitials(profile?.display_name ?? profile?.email)}
            </motion.button>
          </div>
        </motion.header>

        {/* Search bar */}
        <AnimatePresence>
          {searching && (
            <motion.div
              style={{ padding: "0 16px 4px" }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "rgba(215,215,255,0.40)" }} />
                <input
                  aria-label="Search trips"
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search trips…"
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 14px 12px 40px", fontSize: 15, color: "#fff", outline: "none", ...FONT }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter tabs */}
        <motion.div
          style={{ display: "flex", gap: 8, padding: "8px 16px 14px", overflowX: "auto", scrollbarWidth: "none" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        >
          {TABS.map(({ id, label }) => {
            const active = tab === id;
            const count  = counts[id];
            return (
              <motion.button
                key={id}
                onClick={() => setTab(id)}
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20, background: active ? AMBER_GRAD : "rgba(255,255,255,0.06)", border: `1px solid ${active ? "transparent" : "rgba(255,255,255,0.11)"}`, color: active ? "#1a0800" : "rgba(215,215,255,0.70)", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: active ? AMBER_GLOW : "none", ...FONT }}
                whileTap={{ scale: 0.93 }} transition={TAP}
              >
                {label}
                {count > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: active ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.10)", color: active ? "#1a0800" : "rgba(215,215,255,0.55)", borderRadius: 20, padding: "1px 7px", lineHeight: 1.6 }}>
                    {count}
                  </span>
                )}
              </motion.button>
            );
          })}
        </motion.div>

        {/* List */}
        <div style={{ flex: 1, padding: "0 16px 120px", overflowY: "auto" }}>
          <AnimatePresence mode="wait">
            {visible.length === 0 ? (
              <EmptyState key={`empty-${tab}`} tab={tab} query={query} onNewTrip={() => router.push("/dashboard")} />
            ) : (
              <motion.div
                key={`list-${tab}-${query}`}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {visible.map((trip, i) => (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ delay: i * 0.05, duration: 0.28 }}
                  >
                    <TripCard
                      trip={trip}
                      index={initialTrips.indexOf(trip)}
                      capabilities={capabilitiesByTripId[trip.id]}
                      onOpen={() => router.push(`/trip/${trip.id}/mobile`)}
                      onDelete={() => setDeleteTarget(trip)}
                      onCopyCode={() => navigator.clipboard.writeText(trip.invite_code ?? "")}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Nav */}
        <AppBottomNav active="trips" profile={profile} />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this trip?"
        message={deleteTarget ? `"${deleteTarget.title}" and all its stops and expenses will be permanently deleted. This can't be undone.` : ""}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── TripCard ──────────────────────────────────────────────────────────────────
function TripCard({ trip, index, capabilities, onOpen, onDelete, onCopyCode }: {
  trip: Trip; index: number; capabilities?: TripCapabilities;
  onOpen: () => void; onDelete: () => void; onCopyCode: () => void;
}) {
  const status   = getStatus(trip);
  const badge    = getStatusBadge(trip);
  const nights   = getNights(trip.start_date, trip.end_date);
  const idx      = Math.abs(index) % CARD_GRADIENTS.length;
  const muted    = status === "completed";
  const isLive   = status === "ongoing";

  return (
    <motion.div
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14,
        background: isLive ? "rgba(245,166,35,0.06)" : "rgba(255,255,255,0.055)",
        border: `1px solid ${isLive ? "rgba(245,166,35,0.22)" : "rgba(255,255,255,0.11)"}`,
        borderRadius: 20, backdropFilter: "blur(16px)",
        padding: "14px 16px", cursor: "pointer", textAlign: "left",
        opacity: muted ? 0.72 : 1,
      }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ background: isLive ? "rgba(245,166,35,0.10)" : "rgba(255,255,255,0.08)" }}
      transition={TAP}
    >
      <button type="button" onClick={onOpen} style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 14, padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
      {/* Icon with role badge */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: muted ? "linear-gradient(135deg,#2a2a3a,#1e1e2e)" : CARD_GRADIENTS[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: muted ? 22 : 26, filter: muted ? "grayscale(0.5)" : "none" }}>
          {muted ? "✓" : (trip.vibe && VIBE_EMOJIS[trip.vibe]) || CARD_EMOJIS[idx]}
        </div>
        <span style={{ position: "absolute", bottom: -4, right: -4, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: capabilities?.canManageTrip ? "rgba(245,166,35,0.90)" : capabilities?.canEdit ? "rgba(124,58,237,0.85)" : "rgba(71,85,105,.9)", color: "#fff", borderRadius: 6, padding: "2px 5px", border: "1.5px solid #0a1020" }}>
          {capabilities?.role?.toUpperCase() ?? "VIEWER"}
        </span>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {badge && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 20, padding: "2px 9px" }}>
              {badge.pulse && (
                <motion.span
                  style={{ width: 6, height: 6, borderRadius: "50%", background: badge.color, display: "inline-block", flexShrink: 0 }}
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {badge.label}
            </span>
          </div>
        )}
        <p style={{ fontSize: 16, fontWeight: 700, color: muted ? "rgba(215,215,255,0.60)" : "#fff", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {trip.title}
        </p>
        <p style={{ fontSize: 13, color: "rgba(215,215,255,0.50)", margin: 0 }}>
          {trip.start_date
            ? `${formatDate(trip.start_date)}${trip.end_date ? ` – ${formatDate(trip.end_date)}` : ""}`
            : "No dates set"}
          {nights !== null && nights > 0 ? ` · ${nights} night${nights !== 1 ? "s" : ""}` : ""}
        </p>
      </div>
      </button>

      {/* Menu */}
      {capabilities?.canManageTrip && <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
          <motion.button
            type="button"
            aria-label={`Open actions for ${trip.title}`}
            style={{ width: 44, height: 44, padding: 0, border: 0, background: "transparent", borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(215,215,255,0.40)", cursor: "pointer" }}
            whileTap={{ scale: 0.84 }} transition={TAP}
          >
            <MoreVertical style={{ width: 18, height: 18 }} />
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onCopyCode(); }}>
            <Ticket style={{ width: 14, height: 14, marginRight: 8 }} />
            Copy Invite Code
          </DropdownMenuItem>
          <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={e => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 style={{ width: 14, height: 14, marginRight: 8 }} />
                Delete Trip
              </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </motion.div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ tab, query, onNewTrip }: { tab: FilterTab; query: string; onNewTrip: () => void }) {
  const copy = EMPTY_COPY[tab];
  return (
    <motion.div
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, backdropFilter: "blur(16px)", padding: "52px 28px", textAlign: "center", marginTop: 8 }}
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <p style={{ fontSize: 44, margin: "0 0 16px" }}>{query ? "🔍" : copy.emoji}</p>
      <p style={{ color: "#fff", fontWeight: 600, fontSize: 17, margin: "0 0 8px" }}>
        {query ? `No results for "${query}"` : copy.title}
      </p>
      <p style={{ color: "rgba(215,215,255,0.52)", fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 }}>
        {query ? "Try a different search term." : copy.sub}
      </p>
      {!query && tab === "all" && (
        <motion.button
          onClick={onNewTrip}
          style={{ background: AMBER_GRAD, color: "#1a0800", fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, padding: "13px 28px", boxShadow: AMBER_GLOW, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, ...FONT }}
          whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.03 }} transition={TAP}
        >
          <Plus style={{ width: 18, height: 18 }} />
          Create a Trip
        </motion.button>
      )}
    </motion.div>
  );
}
