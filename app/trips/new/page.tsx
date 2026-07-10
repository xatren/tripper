import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NewTripClient } from './NewTripClient';

export default async function NewTripPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  return <NewTripClient userId={user.id} />;
}
