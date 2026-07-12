import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripsClient } from './TripsClient';

export default async function TripsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .order('start_date', { ascending: true });

  return <TripsClient profile={profile} trips={trips ?? []} userId={user.id} />;
}
