"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Ruler, Info } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { loadSettings, persistSettings, type AppSettings } from "@/lib/settings";
import type { Profile } from "@/types";
import { DUSK, FONT_INTER, glassCard, SUNSET_GRADIENT } from "@/components/design/tokens";

// ── Design tokens ─────────────────────────────────────────────────────────────
const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";
const TAP = { type: "spring" as const, stiffness: 420, damping: 22 };

const DEFAULTS: AppSettings = { distanceUnit: "km" };

// ── UI atoms ──────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: DUSK.textMuted, letterSpacing: "0.08em", padding: "16px 16px 10px", margin: 0 }}>
      {children}
    </p>
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
            background: value === o.value ? SUNSET_GRADIENT : "rgba(255,255,255,0.06)",
            borderColor: value === o.value ? "transparent" : "rgba(255,255,255,0.12)",
            color: value === o.value ? DUSK.onAmber : DUSK.textSecondary,
            boxShadow: value === o.value ? "0 0 10px rgba(245,140,0,0.25)" : "none",
            ...FONT_INTER,
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
  // `right` (e.g. ChipSelect) renders its own <button>s — a <button> can't
  // contain a <button> in valid HTML, so this row is a div even when
  // pressable, with a role/tabIndex/key handler standing in for it.
  return (
    <motion.div
      onClick={onPress}
      onKeyDown={onPress ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPress(); } } : undefined}
      role={onPress ? "button" : undefined}
      tabIndex={onPress ? 0 : undefined}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "none", border: "none", cursor: onPress ? "pointer" : "default", textAlign: "left" }}
      whileTap={onPress ? { scale: 0.98 } : {}}
      transition={TAP}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ flex: 1, fontSize: 15, color: DUSK.textPrimary, ...FONT_INTER }}>{label}</span>
      {right}
    </motion.div>
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
    persistSettings(next);
  };

  const ic = DUSK.textSecondary;

  return (
    <div className="atmosphere" style={{ ...FONT_INTER, minHeight: "100svh", position: "relative", overflow: "hidden" }}>
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
            <ChevronLeft style={{ width: 20, height: 20, color: DUSK.textSecondary }} />
          </motion.button>

          <span style={{ fontSize: 17, fontWeight: 700, color: DUSK.textPrimary }}>Settings</span>

          <div style={{ width: 36, height: 36, borderRadius: "50%", background: AVATAR_GRAD, border: `2px solid ${DUSK.amber}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: DUSK.textPrimary }}>
            {getInitials(profile?.display_name ?? profile?.email)}
          </div>
        </motion.header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 60px" }}>

          {/* App Preferences */}
          <motion.div style={{ ...glassCard(), marginBottom: 14, overflow: "hidden" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <SectionLabel>APP PREFERENCES</SectionLabel>

            <SettingRow
              icon={<Ruler style={{ width: 16, height: 16, color: ic }} />}
              label="Distance unit"
              right={<ChipSelect options={[{ label: "km", value: "km" }, { label: "mi", value: "mi" }]} value={s.distanceUnit} onChange={(v) => update("distanceUnit", v)} />}
            />
          </motion.div>

          {/* About */}
          <motion.div style={{ ...glassCard(), overflow: "hidden" }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}>
            <SectionLabel>ABOUT</SectionLabel>

            <SettingRow
              icon={<Info style={{ width: 16, height: 16, color: ic }} />}
              label="Version"
              right={<span style={{ fontSize: 13, color: DUSK.textMuted, ...FONT_INTER }}>1.0.0</span>}
            />
          </motion.div>

        </div>
      </div>
    </div>
  );
}
