import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TripMobileClient } from './TripMobileClient';
import type { ItineraryItem, MemberRole, Trip, Stop, Profile, TripMember } from '@/types';
import { tripCapabilitiesForRole } from '@/lib/trip-capabilities';
import { logOptionalDataError, optionalQueryData, requiredQueryData, throwServerDataError } from '@/lib/supabase/server-errors';
import {
  OVERVIEW_EXPENSE_SELECT,
  OVERVIEW_JOURNAL_SELECT,
  OVERVIEW_PACKING_SELECT,
  type OverviewSection,
  type TripOverviewData,
} from './overview-data';

interface TripMobilePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}

const VALID_DEEP_LINK_SECTIONS = ['overview', 'plan', 'explore', 'bookings', 'more'] as const;
type DeepLinkSection = (typeof VALID_DEEP_LINK_SECTIONS)[number];

function resolveInitialSection(section: string | undefined): 'overview' | 'plan' | 'explore' | 'bookings' {
  const valid = VALID_DEEP_LINK_SECTIONS.includes(section as DeepLinkSection) ? (section as DeepLinkSection) : 'overview';
  // "more" is a sheet, not a persistent screen — land on Overview and let the client open it.
  return valid === 'more' ? 'overview' : valid;
}

/**
 * Overview sections are non-critical: a failure degrades that one section to
 * an explicit error state (client offers retry) instead of failing the page —
 * and never silently becomes an empty list.
 */
function overviewSection<T>(
  context: { route: string; operation: string },
  result: { data: T[] | null; error: { code?: string | null; status?: number | null } | null },
): OverviewSection<T> {
  if (result.error || result.data === null) {
    logOptionalDataError(context, result.error);
    return { status: 'error', rows: [] };
  }
  return { status: 'ready', rows: result.data };
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
  // Stops/profiles are critical; the overview summary queries (expenses,
  // packing, journal) are optional sections batched into the same round trip.
  const [stopsResult, profilesResult, expensesResult, packingResult, journalResult, itineraryResult] = await Promise.all([
    supabase
      .from('stops')
      .select('*')
      .eq('trip_id', id)
      .order('order_index', { ascending: true }),
    supabase.from('profiles').select('*').in('id', memberIds),
    supabase.from('expenses').select(OVERVIEW_EXPENSE_SELECT).eq('trip_id', id),
    supabase.from('packing_items').select(OVERVIEW_PACKING_SELECT).eq('trip_id', id),
    supabase.from('journal_entries').select(OVERVIEW_JOURNAL_SELECT).eq('trip_id', id),
    supabase
      .from('itinerary_items')
      .select('*')
      .eq('trip_id', id)
      .order('local_date', { ascending: true })
      .order('order_index', { ascending: true }),
  ]);

  const overview: TripOverviewData = {
    expenses: overviewSection({ route: '/trip/[id]/mobile', operation: 'overview_expenses.select' }, expensesResult),
    packing: overviewSection({ route: '/trip/[id]/mobile', operation: 'overview_packing.select' }, packingResult),
    journal: overviewSection({ route: '/trip/[id]/mobile', operation: 'overview_journal.select' }, journalResult),
  };

  const stops = requiredQueryData({ route: '/trip/[id]/mobile', operation: 'stops.select' }, stopsResult);
  // The unified itinerary is additive: on a database that hasn't run the
  // itinerary migration yet the select fails, editing is disabled, and the
  // timeline falls back to the read-only stop projection.
  const itineraryEnabled = !itineraryResult.error;
  const itineraryItems = optionalQueryData(
    { route: '/trip/[id]/mobile', operation: 'itinerary_items.select' },
    itineraryResult,
    [],
  );
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
      items={itineraryItems as ItineraryItem[]}
      itineraryEnabled={itineraryEnabled}
      currentUserId={user.id}
      members={members}
      capabilities={capabilities}
      initialSection={initialSection}
      overview={overview}
    />
  );
}
