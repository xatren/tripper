import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
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

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

  const { data, error: joinError } = await supabase.rpc('join_trip_by_invite', {
    p_invite_code: code,
    p_client_ip: clientIp,
  });

  if (joinError || !data || data.outcome !== 'joined' || !data.trip_id) {
    const isRateLimited = data?.outcome === 'rate_limited';
    redirect(`/dashboard?error=${isRateLimited ? 'invite_rate_limited' : 'invalid_invite'}`);
  }

  redirect(`/trip/${data.trip_id}/mobile`);
}
