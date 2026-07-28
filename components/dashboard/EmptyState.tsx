"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { DUSK, FONT_INTER, SUNSET_GRADIENT } from "@/components/design/tokens";
import { AMBER_GLOW, TAP_SPRING } from "./dashboard-ui";

export function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <motion.div
      style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 20, backdropFilter: "blur(16px)", padding: "48px 24px", textAlign: "center" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div style={{ width: 64, height: 64, borderRadius: 18, background: SUNSET_GRADIENT, boxShadow: AMBER_GLOW, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MapPin style={{ width: 30, height: 30, color: DUSK.onAmber }} />
      </div>
      <p style={{ color: DUSK.textPrimary, fontWeight: 600, fontSize: 17, margin: "0 0 8px" }}>No active or upcoming trips</p>
      <p style={{ color: DUSK.textSecondary, fontSize: 14, margin: "0 0 28px" }}>
        Start planning a new trip. Your completed trips are still available in Trips.
      </p>
      <motion.button
        onClick={onCreateClick}
        style={{ background: SUNSET_GRADIENT, color: DUSK.onAmber, fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, padding: "13px 32px", boxShadow: AMBER_GLOW, cursor: "pointer", ...FONT_INTER }}
        whileTap={{ scale: 0.94 }}
        whileHover={{ scale: 1.03 }}
        transition={TAP_SPRING}
      >
        Create a New Trip
      </motion.button>
    </motion.div>
  );
}
