'use client';

import { motion } from 'framer-motion';
import { useTripStore } from '@/store/tripStore';

interface SidebarItem {
  id: 'route' | 'budget' | 'members';
  icon: string;
  label: string;
}

const ITEMS: SidebarItem[] = [
  { id: 'route', icon: '🗺️', label: 'Route' },
  { id: 'budget', icon: '💰', label: 'Budget' },
  { id: 'members', icon: '👥', label: 'Members' },
];

export function Sidebar() {
  const { activePanel, setActivePanel, pins, budgetItems } = useTripStore();

  const badges: Record<string, number> = {
    route: pins.length,
    budget: budgetItems.length,
  };

  return (
    <aside className="w-14 bg-[#13131A] border-r border-white/8 flex flex-col items-center py-3 gap-1 flex-shrink-0">
      {ITEMS.map((item) => {
        const isActive = activePanel === item.id;
        const badge = badges[item.id];
        return (
          <motion.button
            key={item.id}
            onClick={() => setActivePanel(isActive ? null : item.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={item.label}
            className={`relative w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
              isActive
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-500 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {badge !== undefined && badge > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="text-[9px] text-black font-bold">{badge > 9 ? '9+' : badge}</span>
              </div>
            )}
          </motion.button>
        );
      })}
    </aside>
  );
}
