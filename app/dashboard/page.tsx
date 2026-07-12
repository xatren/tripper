import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .order('updated_at', { ascending: false });

  return <DashboardClient profile={profile} trips={trips ?? []} />;
}
