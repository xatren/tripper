import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MapPin, Users, Camera, DollarSign, Route, Sparkles } from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <nav className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
          <div className="flex items-center gap-2">
            <MapPin className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground">RoadTrip26</span>
          </div>
          <Link href="/login">
            <Button size="sm">Sign In</Button>
          </Link>
        </nav>

        <div className="relative z-10 mx-auto max-w-5xl px-6 py-24 text-center lg:py-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Real-time collaborative planning
          </div>
          <h1 className="mb-6 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Plan your next
            <span className="text-primary"> road trip</span>
            <br />together
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-pretty text-lg text-muted-foreground">
            Create stunning road trips with interactive maps, track expenses,
            and plan every stop along the way — all in real-time with your travel crew.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/login">
              <Button size="lg" className="min-w-[180px]">
                <Route className="h-5 w-5" />
                Start Planning
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="border-t border-border/50 bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">
            Everything you need for the perfect trip
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <MapPin className="h-6 w-6" />, title: "Interactive Maps", desc: "Click anywhere to add pins, draw routes, and explore points of interest along the way." },
              { icon: <Users className="h-6 w-6" />, title: "Real-time Collaboration", desc: "Plan together with your crew. See pins appear instantly as friends edit the trip." },
              { icon: <Camera className="h-6 w-6" />, title: "Photo Galleries", desc: "Upload photos for each stop and build a visual diary of your adventure." },
              { icon: <DollarSign className="h-6 w-6" />, title: "Budget Tracking", desc: "Log expenses by category, track spending, and stay on budget throughout." },
            ].map((f) => (
              <div key={f.title} className="group rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-primary/50 hover:bg-card">
                <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground">Ready to hit the road?</h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Sign in with Google and start planning your next adventure today.
          </p>
          <Link href="/login">
            <Button size="lg">Get Started — It&apos;s Free</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted-foreground">
          Built with Next.js, Supabase &amp; Google Maps
        </div>
      </footer>
    </div>
  );
}
