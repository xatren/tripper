import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripClient } from './TripClient';
import type { Trip, Stop, Expense, Photo, Profile } from '@/types';

interface TripPageProps {
  params: Promise<{ id: string }>;
}

export default async function TripPage({ params }: TripPageProps) {
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

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('trip_id', id)
    .order('created_at', { ascending: false });

  const stopIds = stops?.map((s) => s.id) || [];
  const { data: photos } = stopIds.length > 0
    ? await supabase.from('photos').select('*').in('stop_id', stopIds).order('created_at', { ascending: false })
    : { data: [] };

  const profileIds = [trip.owner_id, trip.collaborator_id].filter(Boolean) as string[];
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', profileIds);

  const currentProfile = profiles?.find((p) => p.id === user.id);

  return (
    <TripClient
      trip={trip as Trip}
      stops={(stops as Stop[]) || []}
      expenses={(expenses as Expense[]) || []}
      photos={(photos as Photo[]) || []}
      profiles={(profiles as Profile[]) || []}
      currentUserId={user.id}
      currentProfile={currentProfile as Profile | undefined}
    />
  );
}
