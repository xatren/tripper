import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripMobileClient } from './TripMobileClient';
import type { Trip, Stop, Profile } from '@/types';

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

  const { data: tripMembers } = await supabase
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', id);

  const memberIds = tripMembers?.map((member) => member.user_id) ?? [];
  const [{ data: stops }, { data: members }] = await Promise.all([
    supabase
      .from('stops')
      .select('*')
      .eq('trip_id', id)
      .order('order_index', { ascending: true }),
    memberIds.length > 0
      ? supabase.from('profiles').select('*').in('id', memberIds)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <TripMobileClient
      trip={trip as Trip}
      stops={(stops as Stop[]) || []}
      currentUserId={user.id}
      members={(members as Profile[]) || []}
    />
  );
}
