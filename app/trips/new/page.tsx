import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NewTripClient } from './NewTripClient';
import { throwServerDataError } from '@/lib/supabase/server-errors';

export default async function NewTripPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throwServerDataError({ route: '/trips/new', operation: 'auth.getUser' }, error);
  if (!user) redirect('/login');
  return <NewTripClient />;
}
