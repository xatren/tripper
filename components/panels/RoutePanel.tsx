'use client';

import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useTripStore } from '@/store/tripStore';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { CATEGORY_COLORS } from '@/types';

export function RoutePanel() {
  const { activePanel, setActivePanel, routeWaypoints, setRouteWaypoints, removeWaypoint, clearRoute, pins } =
    useTripStore();

  const isOpen = activePanel === 'route';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="route-panel"
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed left-16 top-0 bottom-0 z-20 w-72 bg-[#13131A] border-r border-white/8 flex flex-col shadow-2xl"
        >
          <div className="p-4 border-b border-white/8 flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Route Planner</h2>
              <p className="text-slate-500 text-xs mt-0.5">{routeWaypoints.length} stops</p>
            </div>
            <button
              onClick={() => setActivePanel(null)}
              className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {routeWaypoints.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-3xl block mb-2">🗺️</span>
                <p className="text-slate-400 text-sm">No stops added yet</p>
                <p className="text-slate-600 text-xs mt-1">Click pins on the map to add them</p>
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={routeWaypoints}
                onReorder={setRouteWaypoints}
                className="space-y-2"
              >
                {routeWaypoints.map((pin, index) => (
                  <Reorder.Item key={pin.id} value={pin}>
                    <div className="flex items-center gap-3 bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl p-3 cursor-grab active:cursor-grabbing">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[pin.category] }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{pin.title}</p>
                        <CategoryBadge category={pin.category} size="sm" />
                      </div>
                      <button
                        onClick={() => removeWaypoint(pin.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 text-sm"
                      >
                        ✕
                      </button>
                    </div>

                    {index < routeWaypoints.length - 1 && (
                      <div className="flex items-center justify-center py-1">
                        <div className="h-4 w-px bg-white/10" />
                      </div>
                    )}
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>

          {/* Add from pins */}
          {pins.length > 0 && (
            <div className="p-3 border-t border-white/8">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Add Stops</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {pins
                  .filter((p) => !routeWaypoints.find((w) => w.id === p.id))
                  .map((pin) => (
                    <button
                      key={pin.id}
                      onClick={() => {
                        const { addWaypoint } = useTripStore.getState();
                        addWaypoint(pin);
                      }}
                      className="w-full flex items-center gap-2 text-left p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[pin.category] }}
                      />
                      <span className="text-slate-300 text-xs truncate">{pin.title}</span>
                      <span className="ml-auto text-slate-600 text-xs">+</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="p-3 border-t border-white/8">
            <button
              onClick={clearRoute}
              disabled={routeWaypoints.length === 0}
              className="w-full py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear Route
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
