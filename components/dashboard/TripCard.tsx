"use client";

import { motion } from "framer-motion";
import { MoreVertical, Ticket, Trash2 } from "lucide-react";
import type { Trip, TripCapabilities } from "@/types";
import { formatDate } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DUSK } from "@/components/design/tokens";
import { CARD_EMOJIS, CARD_GRADIENTS, TAP_SPRING, VIBE_EMOJIS, getDaysUntil, getNights } from "./dashboard-ui";

export function TripCard({ trip, index, capabilities, onOpen, onDelete, onCopyCode }: {
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
    return { label: "Completed", color: DUSK.amber, bg: "rgba(245,166,35,0.18)", border: "rgba(245,166,35,0.32)" };
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
        <p style={{ fontSize: 16, fontWeight: 700, color: DUSK.textPrimary, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {trip.title}
        </p>
        <p style={{ fontSize: 13, color: DUSK.textSecondary, margin: 0 }}>
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
            style={{ width: 44, height: 44, padding: 0, border: 0, background: "transparent", borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: DUSK.textMuted, cursor: "pointer" }}
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
