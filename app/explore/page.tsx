import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DiscoverClient } from './DiscoverClient';
import { resolveDiscoverCountry } from '@/lib/discover/discover-country';
import { discoverCategory } from '@/lib/discover/categories';
import { requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';
import { selectFeaturedTrip } from '@/lib/map-home';
import type { MemberRole } from '@/types';

interface ExplorePageProps {
  searchParams: Promise<{ country?: string; cat?: string }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/explore', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');

  const [{ country: requestedCountry, cat: requestedCategory }, profileResult, tripsResult, membershipsResult] = await Promise.all([
    searchParams,
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    // `updated_at` feeds selectFeaturedTrip, which decides which trip's country frames the map.
    supabase.from('trips').select('id, title, description, start_date, end_date, updated_at, owner_id, countries'),
    supabase.from('trip_members').select('trip_id, role').eq('user_id', user.id),
  ]);

  const profile = requiredQueryData({ route: '/explore', operation: 'profiles.select' }, profileResult);
  const trips = requiredQueryData({ route: '/explore', operation: 'trips.select' }, tripsResult);
  const memberships = requiredQueryData({ route: '/explore', operation: 'trip_members.select' }, membershipsResult);

  // Resolved on the server so the map mounts on the right country with no client-side
  // flash. The localStorage step of the precedence is layered on after mount.
  const resolution = resolveDiscoverCountry({ requestedCode: requestedCountry, trips });

  const roleByTripId = new Map(memberships.map((membership) => [membership.trip_id, membership.role as MemberRole]));
  // Viewers cannot add stops (`tripCapabilitiesForRole`), so "Add to Route" only
  // ever offers trips the user can actually edit (§9.3 "Viewer role").
  const editableTrips = trips
    .filter((trip) => roleByTripId.get(trip.id) !== 'viewer')
    .map((trip) => ({ id: trip.id, title: trip.title }));

  // The same trip Map Home would feature — reused here as Discover's single
  // "active trip" for one-tap Add to Route and the "already added" set (§10.2).
  const activeTrip = selectFeaturedTrip(
    trips.filter((trip) => roleByTripId.get(trip.id) !== 'viewer'),
  );

  let activeStops: { id: string; name: string; lat: number; lng: number }[] = [];
  if (activeTrip) {
    const stopsResult = await supabase
      .from('stops')
      .select('id, name, lat, lng')
      .eq('trip_id', activeTrip.id);
    activeStops = requiredQueryData({ route: '/explore', operation: 'active_trip_stops.select' }, stopsResult);
  }

  return (
    <DiscoverClient
      profile={profile}
      trips={trips}
      initialCountryCode={resolution.country?.code ?? null}
      initialCountrySource={resolution.source}
      // discoverCategory never throws: an unknown ?cat= renders the default
      // curated layer rather than an empty map.
      initialCategory={discoverCategory(requestedCategory).id}
      currentUserId={user.id}
      editableTrips={editableTrips}
      activeTripId={activeTrip?.id ?? null}
      activeStops={activeStops}
    />
  );
}
