'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useTripStore } from '@/store/tripStore';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, generateInviteLink, getInitials } from '@/lib/utils';

export function Navbar() {
  const { activeTrip, profile, budgetItems, pins } = useTripStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const supabase = createClient();

  const totalSpent = budgetItems.reduce((s, i) => s + i.amount, 0);

  const handleCopyInvite = async () => {
    if (!activeTrip) return;
    const link = generateInviteLink(activeTrip.invite_code);
    await navigator.clipboard.writeText(link);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <header className="h-14 bg-[#13131A]/90 backdrop-blur-md border-b border-white/8 flex items-center px-4 gap-4 relative z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">🗺️</span>
        <span className="font-bold text-white hidden sm:block text-sm">RoadTrip26</span>
      </div>

      {/* Trip title */}
      {activeTrip && (
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="h-5 w-px bg-white/10" />
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-sm truncate">{activeTrip.title}</h1>
            <p className="text-slate-500 text-xs">
              {pins.length} stops
              {activeTrip.total_budget > 0 && ` · ${formatCurrency(totalSpent)} / ${formatCurrency(activeTrip.total_budget)}`}
            </p>
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Invite button */}
        {activeTrip && (
          <button
            onClick={handleCopyInvite}
            className="hidden sm:flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            {copySuccess ? '✓ Copied!' : '🔗 Invite'}
          </button>
        )}

        {/* Avatar menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-semibold text-xs hover:border-amber-500/60 transition-colors overflow-hidden"
          >
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="avatar" width={32} height={32} className="object-cover" />
            ) : (
              getInitials(profile?.display_name ?? profile?.email)
            )}
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 w-48 bg-[#13131A] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
              >
                <div className="p-3 border-b border-white/8">
                  <p className="text-white text-sm font-medium truncate">{profile?.display_name ?? 'User'}</p>
                  <p className="text-slate-500 text-xs truncate">{profile?.email}</p>
                </div>
                <div className="p-1">
                  <a
                    href="/dashboard"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    📋 My Trips
                  </a>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    🚪 Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
