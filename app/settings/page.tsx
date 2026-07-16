import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';
import { requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throwServerDataError({ route: '/settings', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const requiredProfile = requiredQueryData(
    { route: '/settings', operation: 'profiles.select' },
    { data: profile, error: profileError },
  );

  return <SettingsClient profile={requiredProfile} />;
}
