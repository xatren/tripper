"use client";

import { motion } from "framer-motion";
import { DUSK, SUNSET_GRADIENT } from "@/components/design/tokens";
import { AMBER_GLOW, TAP } from "./explore-ui";

export function EmptyCountries({ onDiscover }: { onDiscover: () => void }) {
  return (
    <motion.div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:18, padding:"36px 20px", textAlign:"center" }}
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
    >
      <p style={{ fontSize:36, margin:"0 0 12px" }}>🌍</p>
      <p style={{ color: DUSK.textPrimary, fontWeight:600, fontSize:15, margin:"0 0 6px" }}>No countries yet</p>
      <p style={{ color:"rgba(200,210,255,0.50)", fontSize:12, margin:"0 0 20px", lineHeight:1.6 }}>Add countries to your trips and they&apos;ll appear on the map.</p>
      <motion.button onClick={onDiscover}
        style={{ background:SUNSET_GRADIENT, color: DUSK.onAmber, fontWeight:700, fontSize:13, border:"none", borderRadius:12, padding:"10px 22px", boxShadow:AMBER_GLOW, cursor:"pointer", fontFamily:"var(--font-inter),'Inter',system-ui" }}
        whileTap={{ scale:0.94 }} transition={TAP}
      >Discover Routes</motion.button>
    </motion.div>
  );
}
