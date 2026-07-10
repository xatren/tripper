import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripMobileClient } from './TripMobileClient';
import type { Trip, Stop } from '@/types';

interface TripMobilePageProps {
  params: Promise<{ id: string }>;
}

export default async function TripMobilePage({ params }: TripMobilePageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .single();

  if (tripError || !trip) notFound();

  if (trip.owner_id !== user.id && trip.collaborator_id !== user.id) notFound();

  const { data: stops } = await supabase
    .from('stops')
    .select('*')
    .eq('trip_id', id)
    .order('order_index', { ascending: true });

  return (
    <TripMobileClient
      trip={trip as Trip}
      stops={(stops as Stop[]) || []}
      currentUserId={user.id}
    />
  );
}
