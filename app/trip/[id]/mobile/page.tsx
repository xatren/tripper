import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripMobileClient } from './TripMobileClient';
import type { MemberRole, Trip, Stop, Profile, TripMember } from '@/types';
import { tripCapabilitiesForRole } from '@/lib/trip-capabilities';
import { optionalQueryData, requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';

interface TripMobilePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}

const VALID_DEEP_LINK_SECTIONS = ['plan', 'explore', 'bookings', 'more'] as const;
type DeepLinkSection = (typeof VALID_DEEP_LINK_SECTIONS)[number];

function resolveInitialSection(section: string | undefined): 'plan' | 'explore' | 'bookings' {
  const valid = VALID_DEEP_LINK_SECTIONS.includes(section as DeepLinkSection) ? (section as DeepLinkSection) : 'plan';
  // "more" is a sheet, not a persistent screen — land on Plan and let the client open it.
  return valid === 'more' ? 'plan' : valid;
}

export default async function TripMobilePage({ params, searchParams }: TripMobilePageProps) {
  const { id } = await params;
  const { section } = await searchParams;
  const initialSection = resolveInitialSection(section);
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throwServerDataError({ route: '/trip/[id]/mobile', operation: 'auth.getUser' }, authError);
  if (!user) redirect('/login');

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (tripError) throwServerDataError({ route: '/trip/[id]/mobile', operation: 'trips.select' }, tripError);
  // RLS intentionally makes an inaccessible trip indistinguishable from a missing one.
  if (!trip) notFound();

  const { data: tripMembers, error: membersError } = await supabase
    .from('trip_members')
    .select('user_id, role, joined_at')
    .eq('trip_id', id);

  const memberships = requiredQueryData(
    { route: '/trip/[id]/mobile', operation: 'trip_members.select' },
    { data: tripMembers, error: membersError },
  );
  const currentMembership = memberships.find((member) => member.user_id === user.id);
  if (!currentMembership) notFound();
  const capabilities = tripCapabilitiesForRole(currentMembership.role as MemberRole);

  const memberIds = memberships.map((member) => member.user_id);
  const [stopsResult, profilesResult] = await Promise.all([
    supabase
      .from('stops')
      .select('*')
      .eq('trip_id', id)
      .order('order_index', { ascending: true }),
    supabase.from('profiles').select('*').in('id', memberIds),
  ]);

  const stops = requiredQueryData({ route: '/trip/[id]/mobile', operation: 'stops.select' }, stopsResult);
  // Member profiles are enrichment only: preserve the membership rows and use
  // privacy-safe labels when profile lookup is temporarily unavailable.
  const profiles = optionalQueryData(
    { route: '/trip/[id]/mobile', operation: 'member_profiles.select' },
    profilesResult,
    [],
  );

  const profilesById = new Map(
    (profiles as Profile[]).map((profile) => [profile.id, profile]),
  );
  const members: TripMember[] = memberships.map((membership) => ({
    trip_id: id,
    user_id: membership.user_id,
    role: membership.role as MemberRole,
    joined_at: membership.joined_at,
    profile: profilesById.get(membership.user_id) ?? {
      id: membership.user_id,
      email: membership.user_id === user.id ? (user.email ?? '') : '',
      display_name: membership.user_id === user.id ? 'You' : 'Trip member',
    },
  }));

  return (
    <TripMobileClient
      trip={trip as Trip}
      stops={stops as Stop[]}
      currentUserId={user.id}
      members={members}
      capabilities={capabilities}
      initialSection={initialSection}
    />
  );
}
