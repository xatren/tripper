import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, display_name, avatar_url')
    .eq('id', user.id)
    .single();

  return <SettingsClient profile={profile} />;
}
