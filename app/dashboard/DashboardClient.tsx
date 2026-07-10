"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  MapPin, Plus, MoreVertical, Ticket, Trash2,
  Bell, Home, Briefcase, Compass, FileText,
} from "lucide-react";
import type { Profile, Trip } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate, getInitials } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CreateTripDialog, type CreateTripFormValues,
} from "@/components/dashboard/CreateTripDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "home",      Icon: Home,      label: "Home"      },
  { id: "trips",     Icon: Briefcase, label: "Trips"     },
  { id: "explore",   Icon: Compass,   label: "Explore"   },
  { id: "itinerary", Icon: FileText,  label: "Itinerary" },
  { id: "profile",   Icon: null,      label: "Profile"   },
] as const;

// ── Main component ────────────────────────────────────────────────────────────
interface DashboardClientProps { profile: Profile | null; trips: Trip[] }

export function DashboardClient({ profile, trips: initialTrips }: DashboardClientProps) {
  const [trips, setTrips]         = useState<Trip[]>(initialTrips);
  const [isCreateOpen, setCreate] = useState(false);
  const [isJoinOpen,   setJoin]   = useState(false);
  const [joinCode, setJoinCode]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const router   = useRouter();
  const supabase = createClient();

  const firstName   = profile?.display_name?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "Traveler";
  const upcomingCount = trips.filter((t) => { const d = getDaysUntil(t.start_date); return d !== null && d >= 0; }).length;

  // ── handlers ─────────────────────────────────────────────────────────────
  const buildDescription = (v: CreateTripFormValues, emails: string[]) => {
    const audience = v.visibility === "members" ? "Trip members only" : v.visibility === "followers" ? "My followers" : "Everyone";
    const parts = [
      v.countries.length ? `Countries: ${v.countries.join(", ")}` : null,
      `Who can view: ${audience}`,
      emails.length ? `Invite emails: ${emails.join(", ")}` : null,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join("\n\n") : null;
  };

  const handleCreateTrip = async (values: CreateTripFormValues, inviteEmails: string[]) => {
    setLoading(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setLoading(false); return; }
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { data: trip, error: err } = await supabase.from("trips")
      .insert({ title: values.title, description: buildDescription(values, inviteEmails), start_date: values.start_date || null, end_date: values.end_date || null, total_budget: 0, owner_id: user.id, invite_code: inviteCode })
      .select().single();
    if (err || !trip) { setError(err?.message ?? "Failed to create trip"); setLoading(false); return; }
    setTrips((t) => [trip as Trip, ...t]);
    setCreate(false);
    router.push(`/trip/${trip.id}`);
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setLoading(false); return; }
    const { data: trip, error: findErr } = await supabase.from("trips").select("*").eq("invite_code", joinCode.trim().toUpperCase()).single();
    if (findErr || !trip) { setError("Invalid invite code"); setLoading(false); return; }
    if (trip.owner_id === user.id) { setError("You already own this trip"); setLoading(false); return; }
    if (trip.collaborator_id)      { setError("This trip already has a collaborator"); setLoading(false); return; }
    const { error: joinErr } = await supabase.from("trips").update({ collaborator_id: user.id }).eq("id", trip.id);
    if (joinErr) { setError(joinErr.message); setLoading(false); return; }
    setJoin(false);
    router.push(`/trip/${trip.id}`);
  };

  const handleDelete = async (tripId: string) => {
    await supabase.from("trips").delete().eq("id", tripId);
    setTrips((t) => t.filter((tr) => tr.id !== tripId));
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); };

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
            {/* Bell — join trip */}
            <motion.button
              onClick={() => setJoin(true)}
              title="Join a trip"
              style={{ width: 40, height: 40, borderRadius: 11, position: "relative", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
              whileTap={{ scale: 0.86 }}
              whileHover={{ scale: 1.08, background: "rgba(255,255,255,0.12)" }}
              transition={TAP_SPRING}
            >
              <Bell style={{ width: 18, height: 18, color: "rgba(215,215,255,0.65)" }} />
              <span style={{ position: "absolute", top: 8, right: 9, width: 7, height: 7, background: "#f5a623", borderRadius: "50%", border: "1.5px solid #0a1020" }} />
            </motion.button>

            {/* Avatar */}
            <motion.button
              onClick={handleSignOut}
              title="Sign out"
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
              style={{ fontSize: 14, color: "#f5a623", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
              whileTap={{ scale: 0.92, opacity: 0.7 }}
              transition={TAP_SPRING}
            >
              See all
            </motion.button>
          </motion.div>

          {trips.length === 0 ? (
            <EmptyState onCreateClick={() => { setError(null); setCreate(true); }} />
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
                      isOwner={trip.owner_id === profile?.id}
                      onOpen={() => router.push(`/trip/${trip.id}`)}
                      onDelete={() => handleDelete(trip.id)}
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
              </div>
            </AnimatePresence>
          )}
        </div>

        {/* ── Bottom Nav ── */}
        <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(5,5,20,0.90)", borderTop: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom, 16px)", zIndex: 50 }}>
          {NAV_ITEMS.map(({ id, Icon, label }) => {
            const isActive = id === "home";
            return (
              <motion.button
                key={id}
                onClick={() => { if (id === "profile") router.push("/profile"); if (id === "trips") router.push("/trips"); if (id === "explore") router.push("/explore"); }}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "12px 4px 8px", background: "none", border: "none", cursor: "pointer", position: "relative" }}
                whileTap={{ scale: 0.88 }}
                transition={TAP_SPRING}
              >
                {id === "profile" ? (
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: AVATAR_GRAD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                    {getInitials(profile?.display_name ?? profile?.email)}
                  </div>
                ) : Icon ? (
                  <Icon style={{ width: 22, height: 22, color: isActive ? "#f5a623" : "rgba(215,215,255,0.40)" }} />
                ) : null}
                <span style={{ fontSize: 10, fontWeight: 500, color: isActive ? "#f5a623" : "rgba(215,215,255,0.40)" }}>
                  {label}
                </span>
                {isActive && (
                  <span style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#f5a623" }} />
                )}
              </motion.button>
            );
          })}
        </nav>
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
              <Input id="inviteCode" placeholder="e.g. ABC12345" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required />
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
            {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", margin: 0 }}>{error}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── TripCard ──────────────────────────────────────────────────────────────────
function TripCard({ trip, index, isOwner, onOpen, onDelete, onCopyCode }: {
  trip: Trip; index: number; isOwner: boolean;
  onOpen: () => void; onDelete: () => void; onCopyCode: () => void;
}) {
  const gradient  = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const emoji     = CARD_EMOJIS[index % CARD_EMOJIS.length];
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
    <motion.button
      onClick={onOpen}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: elevated ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.055)", border: `1px solid ${elevated ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.11)"}`, borderRadius: 20, backdropFilter: "blur(16px)", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ background: "rgba(255,255,255,0.085)", borderColor: "rgba(255,255,255,0.17)" }}
      transition={TAP_SPRING}
    >
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

      {/* Context menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <motion.div
            style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(215,215,255,0.42)", cursor: "pointer" }}
            whileTap={{ scale: 0.84 }}
            transition={TAP_SPRING}
          >
            <MoreVertical style={{ width: 18, height: 18 }} />
          </motion.div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyCode(); }}>
            <Ticket style={{ width: 14, height: 14, marginRight: 8 }} />
            Copy Invite Code
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 style={{ width: 14, height: 14, marginRight: 8 }} />
                Delete Trip
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.button>
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
