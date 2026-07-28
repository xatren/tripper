"use client";

import { useEffect, useState } from "react";

export const AMBER_GLOW  = "0 0 20px rgba(245,140,0,0.30)";
export const AVATAR_GRAD = "linear-gradient(135deg, #7c3aed, #4f46e5)";
export const TAP = { type: "spring" as const, stiffness: 420, damping: 22 };

export function ExploreMapPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Loading interactive globe"
      style={{
        width: "100%",
        height: "100%",
        background: "radial-gradient(120% 90% at 50% 20%, #0a0a30 0%, #050518 60%, #000010 100%)",
      }}
    />
  );
}

/** True while the tab is in the foreground; flips off on visibilitychange. */
export function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
