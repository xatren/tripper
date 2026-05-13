'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTripStore } from '@/store/tripStore';
import type { BudgetItem } from '@/types';

export function useBudget(tripId: string | undefined) {
  const { setBudgetItems } = useTripStore();
  const supabase = createClient();

  useEffect(() => {
    if (!tripId) {
      setBudgetItems([]);
      return;
    }

    supabase
      .from('budget_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setBudgetItems(data as BudgetItem[]);
      });
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`trip-budget-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_items',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          // Re-fetch on any change
          supabase
            .from('budget_items')
            .select('*')
            .eq('trip_id', tripId)
            .order('created_at', { ascending: false })
            .then(({ data }) => {
              if (data) setBudgetItems(data as BudgetItem[]);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
}
