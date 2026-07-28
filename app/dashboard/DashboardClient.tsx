"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, Plus, Ticket } from "lucide-react";
import type { Profile, Trip, TripCapabilities } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { removeTripStorageObjects } from "@/lib/trip-storage-cleanup";
import { getInitials } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { showToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppBottomNav } from "@/components/ui/AppBottomNav";
import { DUSK, FONT_INTER, SUNSET_GRADIENT } from "@/components/design/tokens";
import { TripCard } from "@/components/dashboard/TripCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { TAP_SPRING, getDaysUntil } from "@/components/dashboard/dashboard-ui";

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER_GLOW = "0 0 24px rgba(245,140,0,0.32)";
const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";

// ── Helpers ───────────────────────────────────────────────────────────────────
function isTripCompleted(trip: Trip): boolean {
  const completionDate = trip.end_date ?? trip.start_date;
  if (!completionDate) return false;
  const daysUntilCompletion = getDaysUntil(completionDate);
  return daysUntilCompletion !== null && daysUntilCompletion < 0;
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
  const dashboardTrips = trips.filter((trip) => !isTripCompleted(trip));
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
    // Storage objects don't cascade with the trip row — remove them first and
    // keep the trip when cleanup fails so no private file is ever orphaned.
    const cleanup = await removeTripStorageObjects(supabase, tripId);
    if (!cleanup.ok) { showToast("Couldn't remove the trip's photos and documents, so the trip was kept. Retry is safe.", "error"); return; }
    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) { showToast("Couldn't delete the trip. Please try again.", "error"); return; }
    setTrips((t) => t.filter((tr) => tr.id !== tripId));
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="atmosphere" style={{ ...FONT_INTER, minHeight: "100svh", position: "relative", overflow: "hidden" }}>

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
            <div style={{ width: 46, height: 46, borderRadius: 13, background: SUNSET_GRADIENT, boxShadow: AMBER_GLOW, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MapPin style={{ width: 22, height: 22, color: DUSK.onAmber }} />
            </div>
            <span style={{ fontSize: 21, fontWeight: 700, color: DUSK.textPrimary, letterSpacing: -0.3 }}>Tripper</span>
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
              style={{ width: 40, height: 40, borderRadius: "50%", background: AVATAR_GRAD, border: `2px solid ${DUSK.amber}`, boxShadow: "0 0 16px rgba(245,140,0,0.38)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: DUSK.textPrimary, cursor: "pointer", overflow: "hidden", padding: 0 }}
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: DUSK.textPrimary, margin: "0 0 4px", letterSpacing: -0.4 }}>
            {getGreeting()}, {firstName} 👋
          </h1>
          <p style={{ fontSize: 14, color: DUSK.textSecondary, margin: 0 }}>
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
            <span style={{ fontSize: 16, fontWeight: 600, color: DUSK.textPrimary }}>Continue planning your trips</span>
            <motion.button
              onClick={() => router.push("/trips")}
              style={{ fontSize: 14, color: DUSK.amber, fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: "2px 0", ...FONT_INTER }}
              whileTap={{ scale: 0.92, opacity: 0.7 }}
              transition={TAP_SPRING}
            >
              See all
            </motion.button>
          </motion.div>

          {dashboardTrips.length === 0 ? (
            <EmptyState onCreateClick={() => router.push("/trips/new")} />
          ) : (
            <AnimatePresence>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dashboardTrips.map((trip, i) => (
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
                  transition={{ delay: 0.2 + dashboardTrips.length * 0.06, duration: 0.35, ease: "easeOut" }}
                >
                  <motion.button
                    onClick={() => router.push("/trips/new")}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 20, backdropFilter: "blur(16px)", padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ background: "rgba(255,255,255,0.065)", borderColor: "rgba(255,255,255,0.18)" }}
                    transition={TAP_SPRING}
                  >
                    <div style={{ width: 54, height: 54, borderRadius: 16, flexShrink: 0, background: SUNSET_GRADIENT, boxShadow: "0 0 22px rgba(245,140,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus style={{ width: 24, height: 24, color: DUSK.onAmber }} />
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 500, color: DUSK.textSecondary }}>Create new trip</span>
                    <span style={{ marginLeft: "auto", color: DUSK.textMuted, fontSize: 20 }}>›</span>
                  </motion.button>
                </motion.div>

                {/* Join with invite code row */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26 + dashboardTrips.length * 0.06, duration: 0.35, ease: "easeOut" }}
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
                    <span style={{ fontSize: 16, fontWeight: 500, color: DUSK.textSecondary }}>Join with invite code</span>
                    <span style={{ marginLeft: "auto", color: DUSK.textMuted, fontSize: 20 }}>›</span>
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
        <DialogContent
          className="w-[calc(100%-32px)] max-w-[340px] gap-0 rounded-[20px] border-white/[0.12] bg-[#0e0e22]/[0.97] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
          style={FONT_INTER}
        >
          <DialogHeader className="pr-9 text-left">
            <DialogTitle className="text-[18px] font-extrabold leading-6 tracking-[-0.01em] text-white">Join a trip</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-[1.5] text-[rgba(222,220,240,0.76)]">
              Enter the invite code shared by your travel buddy.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="mt-[18px] flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteCode" className="text-[13px] font-semibold text-white/80">Invite code</Label>
              <Input
                id="inviteCode"
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. ABC12345"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); if (error) setError(null); }}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "join-error" : undefined}
                className="h-12 rounded-xl border-white/[0.10] bg-white/[0.05] px-3.5 text-[14px] font-semibold uppercase tracking-[0.06em] text-white shadow-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-white/30 focus-visible:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/15"
              />
              {error && <p id="join-error" role="alert" className="m-0 text-xs leading-4 text-red-400">{error}</p>}
            </div>
            <motion.button
              type="submit"
              disabled={loading || !joinCode.trim()}
              style={{ width: "100%", height: 48, padding: "0 18px", borderRadius: 12, background: SUNSET_GRADIENT, color: DUSK.onAmber, fontWeight: 700, fontSize: 14, border: "none", cursor: loading || !joinCode.trim() ? "not-allowed" : "pointer", boxShadow: AMBER_GLOW, opacity: loading || !joinCode.trim() ? 0.55 : 1, ...FONT_INTER }}
              whileTap={loading || !joinCode.trim() ? undefined : { scale: 0.97 }}
              transition={TAP_SPRING}
            >
              {loading ? "Joining…" : "Join Trip"}
            </motion.button>
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
