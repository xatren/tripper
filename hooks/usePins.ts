'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTripStore } from '@/store/tripStore';
import type { Pin } from '@/types';

export function usePins(tripId: string | undefined) {
  const { setPins, addPin, updatePin, removePin } = useTripStore();
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial load
  useEffect(() => {
    if (!tripId) {
      setPins([]);
      return;
    }

    supabase
      .from('pins')
      .select('*, photos:pin_photos(*)')
      .eq('trip_id', tripId)
      .order('order_index', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setPins(data as Pin[]);
      });
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    if (!tripId) return;

    channelRef.current = supabase
      .channel(`trip-pins-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pins',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          addPin(payload.new as Pin);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pins',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          updatePin(payload.new as Pin);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'pins',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          removePin((payload.old as Pin).id);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
}
