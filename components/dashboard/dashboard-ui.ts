export const AMBER_GLOW = "0 0 24px rgba(245,140,0,0.32)";

export const CARD_GRADIENTS = [
  "linear-gradient(135deg, #0d9488, #0284c7, #4338ca)",
  "linear-gradient(135deg, #b45309, #f59e0b, #e11d48)",
  "linear-gradient(135deg, #374151, #1e293b, #0f766e)",
  "linear-gradient(135deg, #7c3aed, #4f46e5, #0284c7)",
  "linear-gradient(135deg, #065f46, #0d9488, #0369a1)",
];
export const CARD_EMOJIS = ["🗺️", "🌊", "🏰", "🏔️", "🏝️", "🎭", "🌄", "🏛️"];
// Vibe picked in the New Trip wizard (trips.vibe, migration 008).
export const VIBE_EMOJIS: Record<string, string> = {
  Road: "🚗", Fly: "✈️", Camp: "⛺", Beach: "🏖️", Mountain: "🏔️", Backpack: "🎒",
};

// shared spring for all tap animations
export const TAP_SPRING = { type: "spring" as const, stiffness: 420, damping: 22 };

export function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export function getNights(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
}
