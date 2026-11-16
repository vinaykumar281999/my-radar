import Link from "next/link";
import { ArrowRight, BellRing, Link2, Radar as RadarIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LivePreview } from "@/components/LivePreview";
import { StatusPill } from "@/components/plan-meta";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
          <RadarIcon className="size-5 text-primary" /> Radar
        </Link>
        <Button variant="ghost" render={<Link href="/login" />} nativeButton={false}>
          Sign in
        </Button>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pt-8 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> The link-in-bio for your plans
            </span>
            <h1 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Stop hearing{" "}
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-500 bg-clip-text text-transparent">
                &ldquo;You should&apos;ve told me!&rdquo;
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground lg:mx-0">
              Share your upcoming trips, concerts, and weekend plans in one link. Friends tap{" "}
              <strong className="text-foreground">I&apos;m Interested 👋</strong> before the tickets are booked.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                render={<Link href="/login" />}
                nativeButton={false}
                className="h-12 rounded-full px-7 text-base font-semibold shadow-lg shadow-primary/25"
              >
                Claim Your Link <ArrowRight />
              </Button>
              <span className="text-sm text-muted-foreground">Free · 30-second setup</span>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
              <StatusPill status="Just an Idea" />
              <StatusPill status="Booking Soon" />
              <StatusPill status="Locked In" />
            </div>
          </div>

          <LivePreview />
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-16 sm:grid-cols-3">
            {[
              {
                icon: Link2,
                title: "One link, every plan",
                body: "Put radar.app/you in your Instagram bio or WhatsApp status. Update it in seconds.",
              },
              {
                icon: BellRing,
                title: "Friends raise their hand",
                body: "No app or login for them — just name, handle, and an optional note.",
              },
              {
                icon: Sparkles,
                title: "Story-ready cards",
                body: "Download a 9:16 card of your plans and drop it straight into your Story.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="tap-card p-5">
                <Icon className="size-6 text-primary" />
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Made for people who are always down. · <Link href="/login" className="underline underline-offset-2">Claim your link</Link>
      </footer>
    </div>
  );
}
