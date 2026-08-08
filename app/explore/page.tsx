import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DiscoverClient } from './DiscoverClient';
import { resolveDiscoverCountry } from '@/lib/discover/discover-country';
import { discoverCategory } from '@/lib/discover/categories';
import { requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';

interface ExplorePageProps {
  searchParams: Promise<{ country?: string; cat?: string }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/explore', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');

  const [{ country: requestedCountry, cat: requestedCategory }, profileResult, tripsResult] = await Promise.all([
    searchParams,
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    // `updated_at` feeds selectFeaturedTrip, which decides which trip's country frames the map.
    supabase.from('trips').select('id, title, description, start_date, end_date, updated_at, owner_id, countries'),
  ]);

  const profile = requiredQueryData({ route: '/explore', operation: 'profiles.select' }, profileResult);
  const trips = requiredQueryData({ route: '/explore', operation: 'trips.select' }, tripsResult);

  // Resolved on the server so the map mounts on the right country with no client-side
  // flash. The localStorage step of the precedence is layered on after mount.
  const resolution = resolveDiscoverCountry({ requestedCode: requestedCountry, trips });

  return (
    <DiscoverClient
      profile={profile}
      trips={trips}
      initialCountryCode={resolution.country?.code ?? null}
      initialCountrySource={resolution.source}
      // discoverCategory never throws: an unknown ?cat= renders the default
      // curated layer rather than an empty map.
      initialCategory={discoverCategory(requestedCategory).id}
    />
  );
}
