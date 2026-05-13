'use client';

import { useCallback } from 'react';
import { OverlayView } from '@react-google-maps/api';
import { motion } from 'framer-motion';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/types';
import type { Pin } from '@/types';

interface PinMarkerProps {
  pin: Pin;
  isSelected: boolean;
  onClick: (pin: Pin) => void;
}

export function PinMarker({ pin, isSelected, onClick }: PinMarkerProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(pin);
    },
    [pin, onClick]
  );

  const color = CATEGORY_COLORS[pin.category];
  const icon = CATEGORY_ICONS[pin.category];

  return (
    <OverlayView
      position={{ lat: pin.lat, lng: pin.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className="relative cursor-pointer select-none"
        style={{ transform: 'translate(-50%, -100%)' }}
        onClick={handleClick}
      >
        <motion.div
          initial={{ scale: 0, y: -20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          whileHover={{ scale: 1.15 }}
          className="relative"
        >
          {/* Pin body */}
          <div
            className="relative w-10 h-10 rounded-full flex items-center justify-center shadow-lg border-2 transition-all duration-200"
            style={{
              backgroundColor: isSelected ? color : `${color}dd`,
              borderColor: isSelected ? '#fff' : color,
              boxShadow: isSelected
                ? `0 0 0 3px ${color}40, 0 4px 12px ${color}60`
                : `0 2px 8px ${color}40`,
            }}
          >
            <span className="text-lg leading-none">{icon}</span>
          </div>

          {/* Pin tail */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              bottom: -8,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `10px solid ${isSelected ? '#fff' : color}`,
            }}
          />

          {/* Selected ring */}
          {isSelected && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 0 4px ${color}30`,
              }}
            />
          )}

          {/* Completed badge */}
          {pin.is_completed && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border border-[#0A0A0F]">
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}

          {/* Favorite badge */}
          {pin.is_favorite && !pin.is_completed && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border border-[#0A0A0F]">
              <span className="text-[8px]">★</span>
            </div>
          )}
        </motion.div>

        {/* Label */}
        {isSelected && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap"
          >
            <div className="bg-[#13131A] border border-white/10 text-white text-xs px-2 py-1 rounded-lg shadow-lg">
              {pin.title}
            </div>
          </motion.div>
        )}
      </div>
    </OverlayView>
  );
}
