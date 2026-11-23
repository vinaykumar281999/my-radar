import Link from "next/link";
import { Radar as RadarIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoPhone, DemoStatusSwitch, HeroDemoProvider } from "@/components/demo/HeroDemo";
import { HandleClaim } from "@/components/landing/HandleClaim";
import { HowItWorks } from "@/components/landing/HowItWorks";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
          <RadarIcon className="size-5 text-primary" /> Radar
        </Link>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" render={<Link href="/demo" />} nativeButton={false} className="text-muted-foreground">
            See a live example
          </Button>
          <Button variant="ghost" render={<Link href="/login" />} nativeButton={false}>
            Sign in
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <HeroDemoProvider>
        {/* overflow-x-clip: the phone's glow may spill sideways on narrow screens; never scroll for it. */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 overflow-x-clip px-5 pt-8 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div className="min-w-0 text-center lg:text-left">
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

            <HandleClaim className="mx-auto mt-8 lg:mx-0" />

            <DemoStatusSwitch className="mt-6 justify-center lg:justify-start" />
          </div>

          <DemoPhone />
        </section>
        </HeroDemoProvider>

        <HowItWorks />
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Made for people who are always down. · <Link href="/login" className="underline underline-offset-2">Claim your link</Link>
      </footer>
    </div>
  );
}
