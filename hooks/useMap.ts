'use client';

import { useCallback } from 'react';
import { useTripStore } from '@/store/tripStore';
import { createClient } from '@/lib/supabase/client';
import type { PinCategory, Pin } from '@/types';

export function useMap() {
  const { newPinDraft, setNewPinDraft, addPin, activeTrip, profile } = useTripStore();
  const supabase = createClient();

  const createPin = useCallback(
    async (data: {
      title: string;
      category: PinCategory;
      description?: string;
    }) => {
      if (!newPinDraft || !activeTrip || !profile) return null;

      const { data: pin, error } = await supabase
        .from('pins')
        .insert({
          trip_id: activeTrip.id,
          created_by: profile.id,
          title: data.title,
          category: data.category,
          description: data.description,
          lat: newPinDraft.lat,
          lng: newPinDraft.lng,
          order_index: Date.now(),
        })
        .select()
        .single();

      if (!error && pin) {
        addPin(pin as Pin);
        setNewPinDraft(null);
        return pin as Pin;
      }
      return null;
    },
    [newPinDraft, activeTrip, profile, supabase, addPin, setNewPinDraft]
  );

  const cancelDraft = useCallback(() => {
    setNewPinDraft(null);
  }, [setNewPinDraft]);

  return { newPinDraft, createPin, cancelDraft };
}
