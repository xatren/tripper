"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronLeft, Settings, Camera, Lock, LogOut, Trash2, Pencil, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { clearTripperCaches } from "@/components/pwa/RegisterSW";
import type { Profile } from "@/types";
import { Home, Briefcase, Compass, FileText } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG          = "linear-gradient(145deg, #06061c 0%, #0a1020 55%, #071216 100%)";
const AMBER_GRAD  = "linear-gradient(135deg, #f5a623, #f8c04a)";
const AMBER_GLOW  = "0 0 24px rgba(245,140,0,0.32)";
const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";
const FONT: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
};
const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: 20,
  backdropFilter: "blur(16px)",
};
const GLASS_EL: React.CSSProperties = {
  background: "rgba(255,255,255,0.075)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 20,
  backdropFilter: "blur(16px)",
};
const TAP = { type: "spring" as const, stiffness: 420, damping: 22 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTotalNights(trips: TripStat[]): number {
  return trips.reduce((acc, t) => {
    if (!t.start_date || !t.end_date) return acc;
    const n = Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000);
    return acc + Math.max(0, n);
  }, 0);
}

function getCountryCount(trips: TripStat[]): number {
  const all = new Set<string>();
  for (const t of trips) {
    if (!t.description) continue;
    const match = t.description.match(/Countries:\s*([^\n]+)/);
    if (!match) continue;
    match[1].split(",").forEach((c) => { const s = c.trim(); if (s) all.add(s.toLowerCase()); });
  }
  return all.size;
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface TripStat { start_date?: string | null; end_date?: string | null; description?: string | null; }
interface Props { profile: Profile | null; trips: TripStat[]; }

const NAV_ITEMS = [
  { id: "home",      Icon: Home,      label: "Home"      },
  { id: "trips",     Icon: Briefcase, label: "Trips"     },
  { id: "explore",   Icon: Compass,   label: "Explore"   },
  { id: "itinerary", Icon: FileText,  label: "Itinerary" },
  { id: "profile",   Icon: null,      label: "Profile"   },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────
export function ProfileClient({ profile, trips }: Props) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const router   = useRouter();
  const supabase = createClient();

  const totalNights  = getTotalNights(trips);
  const countryCount = getCountryCount(trips);

  const handleSave = async () => {
    setSaving(true); setSaveErr(null); setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", profile?.id ?? "");
    setSaving(false);
    if (error) { setSaveErr(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return;
    await clearTripperCaches();
    router.push("/login");
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure? This will permanently delete your account and all trip data.")) return;
    const { error } = await supabase.auth.signOut();
    if (error) return;
    await clearTripperCaches();
    router.push("/login");
  };

  const statBtnBg = saved
    ? "linear-gradient(135deg,#22c55e,#16a34a)"
    : AMBER_GRAD;

  return (
    <div style={{ ...FONT, background: BG, minHeight: "100svh", position: "relative", overflow: "hidden" }}>
      {/* Orbs */}
      <div style={orb({ top: "2%",  left: "50%", translate: "-50% 0", w: 360, h: 360, color: "rgba(245,166,35,0.22)", blur: 90 })} />
      <div style={orb({ bottom: "25%", left: "-12%",                  w: 260, h: 260, color: "rgba(120,50,220,0.18)",  blur: 80 })} />
      <div style={orb({ top: "50%", right: "-10%",                    w: 220, h: 220, color: "rgba(20,210,190,0.14)",  blur: 80 })} />

      <div style={{ position: "relative", zIndex: 10, maxWidth: 430, margin: "0 auto", minHeight: "100svh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <motion.header
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 8px" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <motion.button
            onClick={() => router.push("/dashboard")}
            style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
            whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.08 }} transition={TAP}
          >
            <ChevronLeft style={{ width: 20, height: 20, color: "rgba(215,215,255,0.70)" }} />
          </motion.button>

          <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Profile</span>

          <motion.button
            onClick={() => router.push("/settings")}
            style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
            whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.08 }} transition={TAP}
          >
            <Settings style={{ width: 18, height: 18, color: "rgba(215,215,255,0.65)" }} />
          </motion.button>
        </motion.header>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 120px" }}>

          {/* Hero */}
          <motion.div
            style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 28, paddingBottom: 8 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <div style={{ position: "relative", marginBottom: 14 }}>
              <div style={{
                width: 88, height: 88, borderRadius: "50%",
                background: AVATAR_GRAD,
                border: "3px solid #f5a623",
                boxShadow: "0 0 20px rgba(245,140,0,0.42)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, fontWeight: 700, color: "#fff", overflow: "hidden",
              }}>
                {profile?.avatar_url
                  ? <Image src={profile.avatar_url} alt="avatar" width={88} height={88} style={{ objectFit: "cover" }} />
                  : getInitials(profile?.display_name ?? profile?.email)
                }
              </div>
              <motion.button
                style={{ position: "absolute", bottom: 2, right: 2, width: 26, height: 26, borderRadius: "50%", background: AMBER_GRAD, boxShadow: "0 0 10px rgba(245,140,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid #0a1020", padding: 0 }}
                whileTap={{ scale: 0.84 }} transition={TAP}
              >
                <Camera style={{ width: 13, height: 13, color: "#1a0800" }} />
              </motion.button>
            </div>

            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: -0.3 }}>
              {profile?.display_name ?? profile?.email?.split("@")[0] ?? "Traveler"}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(215,215,255,0.52)", margin: 0 }}>
              {profile?.email ?? ""}
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            style={{ display: "flex", gap: 10, marginTop: 24 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.14 }}
          >
            {([
              { value: trips.length, label: "Trips",     amber: false },
              { value: countryCount, label: "Countries", amber: true  },
              { value: totalNights,  label: "Nights",    amber: false },
            ] as const).map(({ value, label, amber }) => (
              <div key={label} style={{ flex: 1, ...GLASS, padding: "14px 8px", textAlign: "center" }}>
                <p style={{ fontSize: 24, fontWeight: 700, color: amber ? "#f5a623" : "#fff", margin: "0 0 4px" }}>
                  {value}
                </p>
                <p style={{ fontSize: 12, color: "rgba(215,215,255,0.52)", margin: 0 }}>{label}</p>
              </div>
            ))}
          </motion.div>

          {/* Edit Profile */}
          <motion.div
            style={{ ...GLASS_EL, marginTop: 20, padding: "18px 16px" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.20 }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(215,215,255,0.40)", letterSpacing: "0.08em", margin: "0 0 16px" }}>
              EDIT PROFILE
            </p>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "rgba(215,215,255,0.60)", margin: "0 0 6px" }}>Display name</p>
              <div style={{ position: "relative" }}>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "13px 40px 13px 14px", fontSize: 15, color: "#fff", outline: "none", ...FONT }}
                />
                <Pencil style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "rgba(215,215,255,0.40)" }} />
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 0 16px" }} />

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "rgba(215,215,255,0.60)", margin: "0 0 6px" }}>Email</p>
              <div style={{ position: "relative" }}>
                <input
                  value={profile?.email ?? ""}
                  readOnly
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "13px 40px 13px 14px", fontSize: 15, color: "rgba(215,215,255,0.50)", outline: "none", cursor: "default", ...FONT }}
                />
                <Lock style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "rgba(215,215,255,0.28)" }} />
              </div>
            </div>

            <motion.button
              onClick={handleSave}
              disabled={saving}
              style={{ width: "100%", padding: "14px", borderRadius: 14, background: statBtnBg, color: "#1a0800", fontWeight: 700, fontSize: 15, border: "none", cursor: saving ? "wait" : "pointer", boxShadow: AMBER_GLOW, transition: "background 0.3s", ...FONT }}
              whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }} transition={TAP}
            >
              {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
            </motion.button>

            {saveErr && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 10 }}>{saveErr}</p>}
          </motion.div>

          {/* Account */}
          <motion.div
            style={{ ...GLASS, marginTop: 16, overflow: "hidden" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.26 }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(215,215,255,0.40)", letterSpacing: "0.08em", padding: "16px 16px 12px" }}>
              ACCOUNT
            </p>

            <motion.button
              onClick={handleSignOut}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              whileTap={{ background: "rgba(255,255,255,0.04)", scale: 0.99 }} transition={TAP}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LogOut style={{ width: 16, height: 16, color: "rgba(215,215,255,0.65)" }} />
              </div>
              <span style={{ flex: 1, fontSize: 15, color: "rgba(215,215,255,0.88)", ...FONT }}>Sign Out</span>
              <ChevronRight style={{ width: 16, height: 16, color: "rgba(215,215,255,0.30)" }} />
            </motion.button>

            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 16px" }} />

            <motion.button
              onClick={handleDeleteAccount}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              whileTap={{ scale: 0.99 }} transition={TAP}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trash2 style={{ width: 16, height: 16, color: "rgba(239,68,68,0.75)" }} />
              </div>
              <span style={{ flex: 1, fontSize: 15, color: "rgba(239,68,68,0.85)", ...FONT }}>Delete Account</span>
              <ChevronRight style={{ width: 16, height: 16, color: "rgba(239,68,68,0.35)" }} />
            </motion.button>
          </motion.div>

        </div>

        {/* ── Bottom Nav ── */}
        <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(5,5,20,0.90)", borderTop: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom, 16px)", zIndex: 50 }}>
          {NAV_ITEMS.map(({ id, Icon, label }) => {
            const isActive = id === "profile";
            return (
              <motion.button
                key={id}
                onClick={() => { if (id === "home") router.push("/dashboard"); if (id === "trips") router.push("/trips"); if (id === "explore") router.push("/explore"); }}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "12px 4px 8px", background: "none", border: "none", cursor: "pointer", position: "relative" }}
                whileTap={{ scale: 0.88 }} transition={TAP}
              >
                {id === "profile" ? (
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: AVATAR_GRAD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                    {getInitials(profile?.display_name ?? profile?.email)}
                  </div>
                ) : Icon ? (
                  <Icon style={{ width: 22, height: 22, color: isActive ? "#f5a623" : "rgba(215,215,255,0.40)" }} />
                ) : null}
                <span style={{ fontSize: 10, fontWeight: 500, color: isActive ? "#f5a623" : "rgba(215,215,255,0.40)", ...FONT }}>
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
    </div>
  );
}
