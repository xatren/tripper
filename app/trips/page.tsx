import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripsClient } from './TripsClient';
import type { MemberRole, TripCapabilities } from '@/types';
import { tripCapabilitiesForRole } from '@/lib/trip-capabilities';
import { requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';

export default async function TripsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/trips', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');

  const [profileResult, tripsResult, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('trips').select('*').order('start_date', { ascending: true }),
    supabase.from('trip_members').select('trip_id, role').eq('user_id', user.id),
  ]);

  const profile = requiredQueryData({ route: '/trips', operation: 'profiles.select' }, profileResult);
  const trips = requiredQueryData({ route: '/trips', operation: 'trips.select' }, tripsResult);
  const memberships = requiredQueryData({ route: '/trips', operation: 'trip_members.select' }, membershipsResult);

  const capabilitiesByTripId = Object.fromEntries(
    memberships.map((membership) => [membership.trip_id, tripCapabilitiesForRole(membership.role as MemberRole)])
  ) as Record<string, TripCapabilities>;

  return <TripsClient profile={profile} trips={trips} capabilitiesByTripId={capabilitiesByTripId} />;
}
