import { redirect } from 'next/navigation';

interface TripPageProps {
  params: Promise<{ id: string }>;
}

/** The old desktop trip-planning experience has been retired — send everyone to the current one. */
export default async function TripPage({ params }: TripPageProps) {
  const { id } = await params;
  redirect(`/trip/${id}/mobile`);
}
