"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { DUSK } from "@/components/design/tokens";
import { COUNTRY_COLORS, type Destination } from "./explore-routes-data";

export function DiscoverCard({ dest, index, onPress }: { dest: Destination; index: number; onPress: () => void }) {
  return (
    <motion.button onClick={onPress}
      style={{ width:"100%", display:"flex", alignItems:"center", gap:12, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, backdropFilter:"blur(16px)", padding:"12px 14px", cursor:"pointer", textAlign:"left" }}
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:index*0.05 }}
      whileTap={{ scale:0.97 }} whileHover={{ background:"rgba(255,255,255,0.08)" }}
    >
      <div style={{ width:46, height:46, borderRadius:12, background:COUNTRY_COLORS[index%COUNTRY_COLORS.length], display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{dest.emoji}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:700, color: DUSK.textPrimary, margin:"0 0 1px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{dest.name}</p>
        <p style={{ fontSize:11, color:"rgba(200,210,255,0.45)", margin:"0 0 5px" }}>{dest.country}</p>
        <span style={{ fontSize:10, fontWeight:600, color: DUSK.amber, background:"rgba(245,166,35,0.12)", border:"1px solid rgba(245,166,35,0.25)", borderRadius:20, padding:"2px 8px" }}>{dest.tag}</span>
      </div>
      <Compass style={{ width:16, height:16, color:"rgba(200,210,255,0.25)", flexShrink:0 }} />
    </motion.button>
  );
}
