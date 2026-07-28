"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotionPreference } from "@/components/motion/ReducedMotionProvider";
import { usePageVisible } from "./explore-ui";

export function StarField() {
  // Generated after mount only: Math.random() during SSR would produce values
  // that never match the client render and trigger hydration warnings.
  const [stars, setStars] = useState<{ id:number; x:number; y:number; size:number; delay:number; duration:number }[]>([]);
  useEffect(() => {
    setStars(Array.from({ length:60 }, (_, i) => ({
      id: i, x: Math.random()*100, y: Math.random()*100,
      size: Math.random()*1.5+0.4, delay: Math.random()*5, duration: Math.random()*3+2,
    })));
  }, []);
  // Twinkling pauses when the tab is hidden or the user prefers reduced motion;
  // stars then hold a static mid opacity instead of running 60 infinite tweens.
  const reducedMotion = useReducedMotionPreference();
  const pageVisible   = usePageVisible();
  const twinkle = pageVisible && !reducedMotion;
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      {stars.map(s => (
        <motion.div key={s.id}
          style={{ position:"absolute", left:`${s.x}%`, top:`${s.y}%`, width:s.size, height:s.size, borderRadius:"50%", background:"#fff" }}
          animate={twinkle ? { opacity:[0.08,0.85,0.08] } : { opacity:0.3 }}
          transition={twinkle ? { duration:s.duration, delay:s.delay, repeat:Infinity, ease:"easeInOut" } : { duration:0.3 }}
        />
      ))}
    </div>
  );
}
