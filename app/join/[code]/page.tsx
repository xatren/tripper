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

  // Find trip by invite code
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, title')
    .eq('invite_code', code)
    .single();

  if (tripError || !trip) {
    redirect('/dashboard?error=invalid_invite');
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('trip_id', trip.id)
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    // Add as editor
    await supabase.from('trip_members').insert({
      trip_id: trip.id,
      user_id: user.id,
      role: 'editor',
    });
  }

  redirect(`/trip/${trip.id}/mobile`);
}
