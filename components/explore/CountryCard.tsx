"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { DUSK } from "@/components/design/tokens";
import { COUNTRY_COLORS } from "./explore-routes-data";
import { TAP } from "./explore-ui";

export function CountryCard({ name, lat, lng, index }: { name: string; lat: number; lng: number; index: number }) {
  return (
    <motion.div
      style={{ background:COUNTRY_COLORS[index%COUNTRY_COLORS.length], borderRadius:16, padding:"16px 12px", position:"relative", overflow:"hidden", minHeight:90, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
      whileTap={{ scale:0.96 }} transition={TAP}
    >
      <div style={{ position:"absolute", top:8, right:8, fontSize:9, fontWeight:700, background:"rgba(0,0,0,0.32)", color: DUSK.amber, borderRadius:20, padding:"2px 7px", letterSpacing:"0.06em" }}>VISITED</div>
      <MapPin style={{ width:14, height:14, color:"rgba(255,255,255,0.65)", marginBottom:5 }} />
      <p style={{ fontSize:14, fontWeight:700, color: DUSK.textPrimary, margin:0 }}>{name}</p>
      <p style={{ fontSize:9, color:"rgba(255,255,255,0.40)", margin:"2px 0 0", fontFamily:"monospace" }}>{lat.toFixed(1)}° {lng.toFixed(1)}°</p>
    </motion.div>
  );
}
