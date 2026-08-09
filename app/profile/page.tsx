import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProfileClient } from './ProfileClient';
import { requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/profile', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');

  const [profileResult, tripsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('trips').select('start_date, end_date, description, countries'),
  ]);

  const profile = requiredQueryData({ route: '/profile', operation: 'profiles.select' }, profileResult);
  const trips = requiredQueryData({ route: '/profile', operation: 'trips.select' }, tripsResult);

  return <ProfileClient profile={profile} trips={trips} />;
}
