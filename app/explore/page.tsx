import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ExploreClient } from './ExploreClient';

export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  const [{ data: profile }, { data: trips }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('trips').select('id, title, description, start_date, end_date, owner_id, countries'),
  ]);

  return <ExploreClient profile={profile} trips={trips ?? []} />;
}
