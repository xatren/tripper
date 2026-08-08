import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardClient } from './DashboardClient';
import type { MemberRole, TripCapabilities } from '@/types';
import { tripCapabilitiesForRole } from '@/lib/trip-capabilities';
import { requiredQueryData, retryTransientQueryOnce, throwServerDataError } from '@/lib/supabase/server-errors';
import { selectFeaturedTrip } from '@/lib/map-home';
import type { Stop, Trip } from '@/types';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/dashboard', operation: 'auth.getUser' }, error);
  if (!user) {
    redirect('/login');
  }

  const [profileResult, tripsResult, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('trips').select('*').order('updated_at', { ascending: false }),
    retryTransientQueryOnce(() =>
      supabase.from('trip_members').select('trip_id, role').eq('user_id', user.id)
    ),
  ]);

  const profile = requiredQueryData({ route: '/dashboard', operation: 'profiles.select' }, profileResult);
  const trips = requiredQueryData({ route: '/dashboard', operation: 'trips.select' }, tripsResult);
  const memberships = requiredQueryData({ route: '/dashboard', operation: 'trip_members.select' }, membershipsResult);

  const capabilitiesByTripId = Object.fromEntries(
    memberships.map((membership) => [membership.trip_id, tripCapabilitiesForRole(membership.role as MemberRole)])
  ) as Record<string, TripCapabilities>;

  const featuredTrip = selectFeaturedTrip(trips as Trip[]);
  let featuredStops: Stop[] = [];
  if (featuredTrip) {
    const stopsResult = await supabase
      .from('stops')
      .select('*')
      .eq('trip_id', featuredTrip.id)
      .order('order_index', { ascending: true });
    featuredStops = requiredQueryData(
      { route: '/dashboard', operation: 'featured_stops.select' },
      stopsResult,
    ) as Stop[];
  }

  return (
    <DashboardClient
      profile={profile}
      featuredTrip={featuredTrip}
      featuredStops={featuredStops}
      capabilities={featuredTrip ? capabilitiesByTripId[featuredTrip.id] : undefined}
    />
  );
}
