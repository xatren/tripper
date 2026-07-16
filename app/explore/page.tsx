import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ExploreClient } from './ExploreClient';
import { requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';

export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/explore', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');

  const [profileResult, tripsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('trips').select('id, title, description, start_date, end_date, owner_id, countries'),
  ]);

  const profile = requiredQueryData({ route: '/explore', operation: 'profiles.select' }, profileResult);
  const trips = requiredQueryData({ route: '/explore', operation: 'trips.select' }, tripsResult);

  return <ExploreClient profile={profile} trips={trips} />;
}
