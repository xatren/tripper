import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProfileClient } from './ProfileClient';

export default async function ProfilePage() {
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
    .select('start_date, end_date, description');

  return <ProfileClient profile={profile} trips={trips ?? []} />;
}
