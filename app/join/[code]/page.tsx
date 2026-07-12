import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect(`/login?next=/join/${code}`);
  }

  const { data: tripId, error: joinError } = await supabase.rpc('join_trip_by_invite', {
    p_invite_code: code,
  });

  if (joinError || !tripId) {
    redirect('/dashboard?error=invalid_invite');
  }

  redirect(`/trip/${tripId}/mobile`);
}
