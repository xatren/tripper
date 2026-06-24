"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Ruler, DollarSign,
  Map, Bell, BellOff, Star, FileText, Shield,
  Info, Moon, Globe,
} from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG          = "linear-gradient(145deg, #06061c 0%, #0a1020 55%, #071216 100%)";
const AMBER_GRAD  = "linear-gradient(135deg, #f5a623, #f8c04a)";
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
const TAP = { type: "spring" as const, stiffness: 420, damping: 22 };

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

// ── Settings state ────────────────────────────────────────────────────────────
interface AppSettings {
  distanceUnit:   "km"  | "mi";
  currency:       "USD" | "EUR" | "GBP" | "TRY";
  mapType:        "roadmap" | "satellite";
  language:       "en" | "tr";
  tripReminders:  boolean;
  collabActivity: boolean;
  darkMode:       boolean;
}

const DEFAULTS: AppSettings = {
  distanceUnit:   "km",
  currency:       "USD",
  mapType:        "roadmap",
  language:       "en",
  tripReminders:  true,
  collabActivity: true,
  darkMode:       true,
};

const KEY = "tripper_settings";

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

function persist(s: AppSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* noop */ }
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(215,215,255,0.40)", letterSpacing: "0.08em", padding: "16px 16px 10px", margin: 0 }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 16px" }} />;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!value)}
      style={{
        width: 46, height: 26, borderRadius: 13, flexShrink: 0,
        background: value ? AMBER_GRAD : "rgba(255,255,255,0.12)",
        border: "none", cursor: "pointer", position: "relative",
        boxShadow: value ? "0 0 12px rgba(245,140,0,0.30)" : "none",
        transition: "background 0.2s, box-shadow 0.2s",
      }}
      whileTap={{ scale: 0.92 }} transition={TAP}
    >
      <motion.span
        style={{ position: "absolute", top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
        animate={{ left: value ? 23 : 3 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      />
    </motion.button>
  );
}

function ChipSelect<T extends string>({
  options, value, onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {options.map((o) => (
        <motion.button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: "5px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: "1px solid", cursor: "pointer",
            background: value === o.value ? AMBER_GRAD : "rgba(255,255,255,0.06)",
            borderColor: value === o.value ? "transparent" : "rgba(255,255,255,0.12)",
            color: value === o.value ? "#1a0800" : "rgba(215,215,255,0.70)",
            boxShadow: value === o.value ? "0 0 10px rgba(245,140,0,0.25)" : "none",
            ...FONT,
          }}
          whileTap={{ scale: 0.90 }} transition={TAP}
        >
          {o.label}
        </motion.button>
      ))}
    </div>
  );
}

function SettingRow({
  icon, label, right, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  right: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <motion.button
      onClick={onPress}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "none", border: "none", cursor: onPress ? "pointer" : "default", textAlign: "left" }}
      whileTap={onPress ? { scale: 0.98 } : {}}
      transition={TAP}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ flex: 1, fontSize: 15, color: "rgba(215,215,255,0.88)", ...FONT }}>{label}</span>
      {right}
    </motion.button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SettingsClient({ profile }: { profile: Profile | null }) {
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const router = useRouter();

  useEffect(() => { setS(loadSettings()); }, []);

  const update = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    const next = { ...s, [key]: val };
    setS(next);
    persist(next);
  };

  const ic = "rgba(215,215,255,0.65)";
  const chevron = <ChevronRight style={{ width: 16, height: 16, color: "rgba(215,215,255,0.30)" }} />;

  return (
    <div style={{ ...FONT, background: BG, minHeight: "100svh", position: "relative", overflow: "hidden" }}>
      {/* Orbs */}
      <div style={orb({ top: "3%",  left: "50%", translate: "-50% 0", w: 340, h: 340, color: "rgba(245,166,35,0.20)", blur: 90 })} />
      <div style={orb({ bottom: "20%", left: "-15%",                  w: 260, h: 260, color: "rgba(120,50,220,0.16)",  blur: 80 })} />
      <div style={orb({ top: "55%", right: "-12%",                    w: 220, h: 220, color: "rgba(20,210,190,0.13)",  blur: 80 })} />

      <div style={{ position: "relative", zIndex: 10, maxWidth: 430, margin: "0 auto", minHeight: "100svh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <motion.header
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 8px" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <motion.button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
            whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.08 }} transition={TAP}
          >
            <ChevronLeft style={{ width: 20, height: 20, color: "rgba(215,215,255,0.70)" }} />
          </motion.button>

          <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Settings</span>

          <div style={{ width: 36, height: 36, borderRadius: "50%", background: AVATAR_GRAD, border: "2px solid #f5a623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>
            {getInitials(profile?.display_name ?? profile?.email)}
          </div>
        </motion.header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 60px" }}>

          {/* App Preferences */}
          <motion.div style={{ ...GLASS, marginBottom: 14, overflow: "hidden" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <SectionLabel>APP PREFERENCES</SectionLabel>

            <SettingRow
              icon={<Ruler style={{ width: 16, height: 16, color: ic }} />}
              label="Distance unit"
              right={<ChipSelect options={[{ label: "km", value: "km" }, { label: "mi", value: "mi" }]} value={s.distanceUnit} onChange={(v) => update("distanceUnit", v)} />}
            />
            <Divider />
            <SettingRow
              icon={<DollarSign style={{ width: 16, height: 16, color: ic }} />}
              label="Currency"
              right={<ChipSelect options={[{ label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "TRY", value: "TRY" }]} value={s.currency} onChange={(v) => update("currency", v)} />}
            />
            <Divider />
            <SettingRow
              icon={<Map style={{ width: 16, height: 16, color: ic }} />}
              label="Map type"
              right={<ChipSelect options={[{ label: "Road", value: "roadmap" }, { label: "Satellite", value: "satellite" }]} value={s.mapType} onChange={(v) => update("mapType", v)} />}
            />
            <Divider />
            <SettingRow
              icon={<Globe style={{ width: 16, height: 16, color: ic }} />}
              label="Language"
              right={<ChipSelect options={[{ label: "EN", value: "en" }, { label: "TR", value: "tr" }]} value={s.language} onChange={(v) => update("language", v)} />}
            />
            <Divider />
            <SettingRow
              icon={<Moon style={{ width: 16, height: 16, color: ic }} />}
              label="Dark mode"
              right={<Toggle value={s.darkMode} onChange={(v) => update("darkMode", v)} />}
            />
          </motion.div>

          {/* Notifications */}
          <motion.div style={{ ...GLASS, marginBottom: 14, overflow: "hidden" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <SectionLabel>NOTIFICATIONS</SectionLabel>

            <SettingRow
              icon={<Bell style={{ width: 16, height: 16, color: ic }} />}
              label="Trip reminders"
              right={<Toggle value={s.tripReminders} onChange={(v) => update("tripReminders", v)} />}
            />
            <Divider />
            <SettingRow
              icon={<BellOff style={{ width: 16, height: 16, color: ic }} />}
              label="Collaborator activity"
              right={<Toggle value={s.collabActivity} onChange={(v) => update("collabActivity", v)} />}
            />
          </motion.div>

          {/* About */}
          <motion.div style={{ ...GLASS, overflow: "hidden" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}>
            <SectionLabel>ABOUT</SectionLabel>

            <SettingRow
              icon={<Star style={{ width: 16, height: 16, color: ic }} />}
              label="Rate Tripper"
              right={chevron}
              onPress={() => { /* open store */ }}
            />
            <Divider />
            <SettingRow
              icon={<FileText style={{ width: 16, height: 16, color: ic }} />}
              label="Terms of Service"
              right={chevron}
              onPress={() => { /* open terms */ }}
            />
            <Divider />
            <SettingRow
              icon={<Shield style={{ width: 16, height: 16, color: ic }} />}
              label="Privacy Policy"
              right={chevron}
              onPress={() => { /* open privacy */ }}
            />
            <Divider />
            <SettingRow
              icon={<Info style={{ width: 16, height: 16, color: ic }} />}
              label="Version"
              right={<span style={{ fontSize: 13, color: "rgba(215,215,255,0.38)", ...FONT }}>1.0.0</span>}
            />
          </motion.div>

        </div>
      </div>
    </div>
  );
}
