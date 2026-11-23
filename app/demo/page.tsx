import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FlaskConical, Radar as RadarIcon } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { DemoProfileFeed } from "@/components/demo/DemoProfile";
import { Button } from "@/components/ui/button";
import { DEMO_HOST } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Live example",
  description: "A made-up Radar profile, so you can see what friends see.",
  robots: { index: false },
};

/**
 * A pretend profile with the same made-up plans as the landing-page phone.
 * No real account and no database reads: everything comes from lib/demo.
 */
export default function DemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pt-4 pb-10">
      <div
        role="note"
        className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-3 text-sm"
      >
        <FlaskConical className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">This is a demo.</span>{" "}
          <span className="text-muted-foreground">Maya isn&apos;t real, and nothing you tap is sent anywhere.</span>
        </p>
      </div>

      <header className="mt-8 flex flex-col items-center text-center">
        <Avatar name={DEMO_HOST.name} className="size-20 text-2xl" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{DEMO_HOST.name}</h1>
        <p className="text-sm font-medium text-muted-foreground">@{DEMO_HOST.username}</p>
        <p className="mt-2 max-w-xs text-[15px] text-balance text-foreground/80">{DEMO_HOST.bio}</p>
      </header>

      <DemoProfileFeed />

      <section className="tap-card mt-10 p-5 text-center">
        <p className="font-bold">Want one like this?</p>
        <p className="mt-1 text-sm text-muted-foreground">Post your rough plans in 15 seconds and put one link in your bio.</p>
        <Button render={<Link href="/" />} nativeButton={false} className="mt-4 h-11 rounded-full px-6 font-semibold">
          Make your own <ArrowRight />
        </Button>
      </section>

      <footer className="mt-auto pt-10 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RadarIcon className="size-3.5 text-primary" />
          Make your own Radar
        </Link>
      </footer>
    </main>
  );
}
