"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, Plus, MoreVertical, Ticket, Trash2 } from "lucide-react";
import type { Profile, Trip, TripCapabilities } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate, getInitials } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppBottomNav } from "@/components/ui/AppBottomNav";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG         = "linear-gradient(145deg, #06061c 0%, #0a1020 55%, #071216 100%)";
const AMBER_GRAD = "linear-gradient(135deg, #f5a623, #f8c04a)";
const AMBER_GLOW = "0 0 24px rgba(245,140,0,0.32)";
const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";
const FONT: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
};

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

// shared spring for all tap animations
const TAP_SPRING = { type: "spring" as const, stiffness: 420, damping: 22 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function getNights(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function orb(p: {
  top?: string; bottom?: string; left?: string; right?: string;
  translate?: string; w: number; h: number; color: string; blur: number;
}): React.CSSProperties {
  return {
    position: "absolute",
    ...(p.top     !== undefined && { top:    p.top    }),
    ...(p.bottom  !== undefined && { bottom: p.bottom }),
    ...(p.left    !== undefined && { left:   p.left   }),
    ...(p.right   !== undefined && { right:  p.right  }),
    ...(p.translate !== undefined && { translate: p.translate }),
    width: p.w, height: p.h, borderRadius: "50%",
    background: p.color, filter: `blur(${p.blur}px)`,
    pointerEvents: "none",
  };
}

// ── Main component ────────────────────────────────────────────────────────────
interface DashboardClientProps { profile: Profile | null; trips: Trip[]; capabilitiesByTripId: Record<string, TripCapabilities> }

export function DashboardClient({ profile, trips: initialTrips, capabilitiesByTripId }: DashboardClientProps) {
  const [trips, setTrips]         = useState<Trip[]>(initialTrips);
  const [isJoinOpen,   setJoin]   = useState(false);
  const [joinCode, setJoinCode]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const router   = useRouter();
  const supabase = createClient();

  const firstName   = profile?.display_name?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "Traveler";
  const upcomingCount = trips.filter((t) => { const d = getDaysUntil(t.start_date); return d !== null && d >= 0; }).length;

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const code = joinCode.trim();
    if (!code) { setError("Enter an invite code"); setLoading(false); return; }
    router.push(`/join/${encodeURIComponent(code)}`);
  };

  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);

  const handleDelete = async (tripId: string) => {
    if (!capabilitiesByTripId[tripId]?.canManageTrip) return;
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) { showToast("Couldn't delete the trip. Please try again.", "error"); return; }
    setTrips((t) => t.filter((tr) => tr.id !== tripId));
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...FONT, background: BG, minHeight: "100svh", position: "relative", overflow: "hidden" }}>

      {/* Ambient orbs */}
      <div style={orb({ top: "2%",  left: "50%", translate: "-50% 0", w: 380, h: 380, color: "rgba(245,166,35,0.26)", blur: 90 })} />
      <div style={orb({ bottom: "22%", left: "-12%",                  w: 280, h: 280, color: "rgba(120,50,220,0.20)",  blur: 80 })} />
      <div style={orb({ top: "48%", right: "-10%",                    w: 240, h: 240, color: "rgba(20,210,190,0.16)",  blur: 80 })} />

      {/* Page shell */}
      <div style={{ position: "relative", zIndex: 10, maxWidth: 430, margin: "0 auto", minHeight: "100svh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 12px" }}>
          <motion.div
            style={{ display: "flex", alignItems: "center", gap: 10 }}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 13, background: AMBER_GRAD, boxShadow: AMBER_GLOW, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MapPin style={{ width: 22, height: 22, color: "#1a0800" }} />
            </div>
            <span style={{ fontSize: 21, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>Tripper</span>
          </motion.div>

          <motion.div
            style={{ display: "flex", alignItems: "center", gap: 10 }}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {/* Avatar → profile */}
            <motion.button
              onClick={() => router.push("/profile")}
              title="Profile"
              aria-label="Open profile"
              style={{ width: 40, height: 40, borderRadius: "50%", background: AVATAR_GRAD, border: "2px solid #f5a623", boxShadow: "0 0 16px rgba(245,140,0,0.38)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", overflow: "hidden", padding: 0 }}
              whileTap={{ scale: 0.86 }}
              whileHover={{ scale: 1.06 }}
              transition={TAP_SPRING}
            >
              {profile?.avatar_url
                ? <Image src={profile.avatar_url} alt="avatar" width={40} height={40} style={{ objectFit: "cover" }} />
                : getInitials(profile?.display_name ?? profile?.email)
              }
            </motion.button>
          </motion.div>
        </header>

        {/* ── Greeting ── */}
        <motion.div
          style={{ padding: "8px 20px 24px" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: -0.4 }}>
            {getGreeting()}, {firstName} 👋
          </h1>
          <p style={{ fontSize: 14, color: "rgba(215,215,255,0.60)", margin: 0 }}>
            {upcomingCount > 0
              ? `You have ${upcomingCount} upcoming trip${upcomingCount > 1 ? "s" : ""}`
              : "No upcoming trips — let's plan one!"}
          </p>
        </motion.div>

        {/* ── Trip list ── */}
        <div style={{ flex: 1, padding: "0 16px 120px" }}>

          {/* Section header */}
          <motion.div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "0 4px" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.18 }}
          >
            <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Continue planning your trips</span>
            <motion.button
              onClick={() => router.push("/trips")}
              style={{ fontSize: 14, color: "#f5a623", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: "2px 0", ...FONT }}
              whileTap={{ scale: 0.92, opacity: 0.7 }}
              transition={TAP_SPRING}
            >
              See all
            </motion.button>
          </motion.div>

          {trips.length === 0 ? (
            <EmptyState onCreateClick={() => router.push("/trips/new")} />
          ) : (
            <AnimatePresence>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {trips.map((trip, i) => (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ delay: 0.2 + i * 0.06, duration: 0.35, ease: "easeOut" }}
                  >
                    <TripCard
                      trip={trip}
                      index={i}
                      capabilities={capabilitiesByTripId[trip.id]}
                      onOpen={() => router.push(`/trip/${trip.id}/mobile`)}
                      onDelete={() => setDeleteTarget(trip)}
                      onCopyCode={() => navigator.clipboard.writeText(trip.invite_code ?? "")}
                    />
                  </motion.div>
                ))}

                {/* Create new trip row */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + trips.length * 0.06, duration: 0.35, ease: "easeOut" }}
                >
                  <motion.button
                    onClick={() => router.push("/trips/new")}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 20, backdropFilter: "blur(16px)", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ background: "rgba(255,255,255,0.065)", borderColor: "rgba(255,255,255,0.18)" }}
                    transition={TAP_SPRING}
                  >
                    <div style={{ width: 54, height: 54, borderRadius: 16, flexShrink: 0, background: AMBER_GRAD, boxShadow: "0 0 22px rgba(245,140,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus style={{ width: 24, height: 24, color: "#1a0800" }} />
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 500, color: "rgba(215,215,255,0.88)" }}>Create new trip</span>
                    <span style={{ marginLeft: "auto", color: "rgba(215,215,255,0.42)", fontSize: 20 }}>›</span>
                  </motion.button>
                </motion.div>

                {/* Join with invite code row */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26 + trips.length * 0.06, duration: 0.35, ease: "easeOut" }}
                >
                  <motion.button
                    onClick={() => { setError(null); setJoin(true); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 20, backdropFilter: "blur(16px)", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ background: "rgba(255,255,255,0.065)", borderColor: "rgba(255,255,255,0.18)" }}
                    transition={TAP_SPRING}
                  >
                    <div style={{ width: 54, height: 54, borderRadius: 16, flexShrink: 0, background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ticket style={{ width: 22, height: 22, color: "#a78bfa" }} />
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 500, color: "rgba(215,215,255,0.88)" }}>Join with invite code</span>
                    <span style={{ marginLeft: "auto", color: "rgba(215,215,255,0.42)", fontSize: 20 }}>›</span>
                  </motion.button>
                </motion.div>
              </div>
            </AnimatePresence>
          )}
        </div>

        {/* ── Bottom Nav ── */}
        <AppBottomNav active="home" profile={profile} />
      </div>

      {/* ── Join Trip dialog ── */}
      <Dialog open={isJoinOpen} onOpenChange={setJoin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a Trip</DialogTitle>
            <DialogDescription>Enter the invite code shared by your travel buddy</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Label htmlFor="inviteCode">Invite Code</Label>
              <Input id="inviteCode" placeholder="e.g. ABC12345" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required aria-invalid={Boolean(error)} aria-describedby={error ? "join-error" : undefined} />
            </div>
            <motion.button
              type="submit"
              style={{ width: "100%", padding: "13px", borderRadius: 12, background: AMBER_GRAD, color: "#1a0800", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", boxShadow: AMBER_GLOW, ...FONT }}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              transition={TAP_SPRING}
            >
              {loading ? "Joining…" : "Join Trip"}
            </motion.button>
            {error && <p id="join-error" role="alert" style={{ color: "#ef4444", fontSize: 13, textAlign: "center", margin: 0 }}>{error}</p>}
          </form>
        </DialogContent>
      </Dialog>

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
  const gradient  = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const emoji     = (trip.vibe && VIBE_EMOJIS[trip.vibe]) || CARD_EMOJIS[index % CARD_EMOJIS.length];
  const daysUntil = getDaysUntil(trip.start_date);
  const nights    = getNights(trip.start_date, trip.end_date);
  const elevated  = index === 0;

  const badge = (() => {
    if (daysUntil === null) return null;
    if (daysUntil === 0)  return { label: "Today!",    color: "rgb(52,211,153)", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.22)" };
    if (daysUntil > 0)    return { label: `In ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`, color: "rgb(52,211,153)", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.22)" };
    return { label: "Completed", color: "#f5a623", bg: "rgba(245,166,35,0.18)", border: "rgba(245,166,35,0.32)" };
  })();

  return (
    <motion.div
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: elevated ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.055)", border: `1px solid ${elevated ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.11)"}`, borderRadius: 20, backdropFilter: "blur(16px)", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ background: "rgba(255,255,255,0.085)", borderColor: "rgba(255,255,255,0.17)" }}
      transition={TAP_SPRING}
    >
      <button type="button" onClick={onOpen} style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 14, padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
      {/* Gradient icon */}
      <div style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
        {emoji}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {badge && (
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 20, padding: "2px 8px", marginBottom: 4 }}>
            {badge.label}
          </span>
        )}
        <p style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {trip.title}
        </p>
        <p style={{ fontSize: 13, color: "rgba(215,215,255,0.60)", margin: 0 }}>
          {trip.start_date
            ? `${formatDate(trip.start_date)}${trip.end_date ? ` – ${formatDate(trip.end_date)}` : ""}`
            : "Dates not set"}
          {nights !== null && nights > 0 ? ` · ${nights} Night${nights > 1 ? "s" : ""}` : ""}
        </p>
      </div>
      </button>

      {/* Context menu */}
      {capabilities?.canManageTrip && <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <motion.button
            type="button"
            aria-label={`Open actions for ${trip.title}`}
            style={{ width: 44, height: 44, padding: 0, border: 0, background: "transparent", borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(215,215,255,0.42)", cursor: "pointer" }}
            whileTap={{ scale: 0.84 }}
            transition={TAP_SPRING}
          >
            <MoreVertical style={{ width: 18, height: 18 }} />
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyCode(); }}>
            <Ticket style={{ width: 14, height: 14, marginRight: 8 }} />
            Copy Invite Code
          </DropdownMenuItem>
          <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
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
function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <motion.div
      style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 20, backdropFilter: "blur(16px)", padding: "48px 24px", textAlign: "center" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div style={{ width: 64, height: 64, borderRadius: 18, background: AMBER_GRAD, boxShadow: AMBER_GLOW, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MapPin style={{ width: 30, height: 30, color: "#1a0800" }} />
      </div>
      <p style={{ color: "#fff", fontWeight: 600, fontSize: 17, margin: "0 0 8px" }}>No trips yet</p>
      <p style={{ color: "rgba(215,215,255,0.60)", fontSize: 14, margin: "0 0 28px" }}>
        Create your first trip or join one with an invite code
      </p>
      <motion.button
        onClick={onCreateClick}
        style={{ background: AMBER_GRAD, color: "#1a0800", fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, padding: "13px 32px", boxShadow: AMBER_GLOW, cursor: "pointer", ...FONT }}
        whileTap={{ scale: 0.94 }}
        whileHover={{ scale: 1.03 }}
        transition={TAP_SPRING}
      >
        Create Your First Trip
      </motion.button>
    </motion.div>
  );
}
