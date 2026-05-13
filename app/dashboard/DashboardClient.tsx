"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, Plus, LogOut, MoreVertical, Ticket, Trash2, Calendar, Users } from "lucide-react";
import type { Profile, Trip } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { formatDate, getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { CreateTripDialog, type CreateTripFormValues } from "@/components/dashboard/CreateTripDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardClientProps {
  profile: Profile | null;
  trips: Trip[];
}

export function DashboardClient({ profile, trips: initialTrips }: DashboardClientProps) {
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const buildTripDescription = (values: CreateTripFormValues, inviteEmails: string[]) => {
    const audience =
      values.visibility === "members"
        ? "Trip members only"
        : values.visibility === "followers"
          ? "My followers"
          : "Everyone";
    const parts = [
      values.countries.length ? `Countries: ${values.countries.join(", ")}` : null,
      `Who can view: ${audience}`,
      inviteEmails.length ? `Invite emails: ${inviteEmails.join(", ")}` : null,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join("\n\n") : null;
  };

  const handleCreateTrip = async (values: CreateTripFormValues, inviteEmails: string[]) => {
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { data: trip, error: createError } = await supabase
      .from("trips")
      .insert({
        title: values.title,
        description: buildTripDescription(values, inviteEmails),
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        total_budget: 0,
        owner_id: user.id,
        invite_code: inviteCode,
      })
      .select()
      .single();

    if (createError || !trip) {
      setError(createError?.message ?? "Failed to create trip");
      setLoading(false);
      return;
    }
    setTrips((t) => [trip as Trip, ...t]);
    setIsCreateOpen(false);
    router.push(`/trip/${trip.id}`);
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setLoading(false); return; }

    const { data: trip, error: findError } = await supabase
      .from("trips")
      .select("*")
      .eq("invite_code", joinCode.trim().toUpperCase())
      .single();

    if (findError || !trip) {
      setError("Invalid invite code");
      setLoading(false);
      return;
    }
    if (trip.owner_id === user.id) {
      setError("You already own this trip");
      setLoading(false);
      return;
    }
    if (trip.collaborator_id) {
      setError("This trip already has a collaborator");
      setLoading(false);
      return;
    }
    const { error: joinError } = await supabase
      .from("trips")
      .update({ collaborator_id: user.id })
      .eq("id", trip.id);

    if (joinError) { setError(joinError.message); setLoading(false); return; }
    setIsJoinOpen(false);
    router.push(`/trip/${trip.id}`);
  };

  const handleDelete = async (tripId: string) => {
    await supabase.from("trips").delete().eq("id", tripId);
    setTrips((t) => t.filter((trip) => trip.id !== tripId));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">RoadTrip26</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {profile?.display_name ?? profile?.email ?? "Traveler"}
            </span>
            {profile?.avatar_url ? (
              <div className="h-8 w-8 overflow-hidden rounded-full border border-border">
                <Image src={profile.avatar_url} alt="avatar" width={32} height={32} className="object-cover" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(profile?.display_name ?? profile?.email)}
              </div>
            )}
            <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Title row */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Your Trips</h1>
            <p className="text-muted-foreground">Plan and manage your road trip adventures</p>
          </div>
          <div className="flex gap-3">
            {/* Join */}
            <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Ticket className="h-4 w-4" />
                  Join Trip
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Join a Trip</DialogTitle>
                  <DialogDescription>Enter the invite code shared by your travel buddy</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleJoin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="inviteCode">Invite Code</Label>
                    <Input id="inviteCode" placeholder="e.g. abc12345" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full">Join Trip</Button>
                </form>
              </DialogContent>
            </Dialog>

            <CreateTripDialog
              open={isCreateOpen}
              onOpenChange={(o) => {
                setIsCreateOpen(o);
                if (o) setError(null);
              }}
              loading={loading}
              error={error}
              onSubmit={handleCreateTrip}
            >
              <Button>
                <Plus className="h-4 w-4" />
                New Trip
              </Button>
            </CreateTripDialog>
          </div>
        </div>

        {/* Trips grid */}
        {trips.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <MapPin className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="mb-2 text-lg font-medium text-foreground">No trips yet</h3>
              <p className="mb-6 text-center text-sm text-muted-foreground">
                Create your first trip or join one with an invite code
              </p>
              <Button
                onClick={() => {
                  setError(null);
                  setIsCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Create Your First Trip
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {trips.map((trip, i) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TripCard
                    trip={trip}
                    isOwner={trip.owner_id === profile?.id}
                    onOpen={() => router.push(`/trip/${trip.id}`)}
                    onDelete={() => handleDelete(trip.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function TripCard({
  trip,
  isOwner,
  onOpen,
  onDelete,
}: {
  trip: Trip;
  isOwner: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="group cursor-pointer transition-colors hover:border-primary/50"
      onClick={onOpen}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="line-clamp-1 text-lg">{trip.title}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {trip.description ?? "No description"}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(trip.invite_code ?? "");
                }}
              >
                <Ticket className="h-4 w-4" />
                Copy Invite Code
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Trip
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {trip.start_date ? formatDate(trip.start_date) : "No dates set"}
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {(trip.members?.length ?? 0) > 0 ? `${trip.members!.length} member${trip.members!.length > 1 ? "s" : ""}` : "Just you"}
          </div>
        </div>
        {trip.invite_code && (
          <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-center">
            <span className="text-xs text-muted-foreground">Invite: </span>
            <span className="font-mono text-sm font-medium text-primary">{trip.invite_code}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
