import Link from "next/link";
import { BellRing, ChevronDown, Link2, Plus, UsersRound } from "lucide-react";

const STEPS = [
  {
    icon: Plus,
    title: "Drop rough plans in 15 seconds",
    body: "A trip, a concert, a hike. Dates can be fuzzy (“next month” is fine) and you can mark them as just an idea.",
  },
  {
    icon: Link2,
    title: "Put one link in your bio",
    body: "radar.app/you goes in your Instagram bio or WhatsApp status. Or download a Story card of your plans.",
  },
  {
    icon: BellRing,
    title: "Friends tap “I’m in” or “Maybe”",
    body: "You see who’s down (and who’s a maybe) before anything is booked. No app or account needed for them on public plans.",
  },
];

const FAQ = [
  {
    q: "Is it free?",
    a: "Yes. Making your Radar, posting plans and sharing your link don’t cost anything.",
  },
  {
    q: "Who can see my plans?",
    a: "You choose per plan. Public plans show on your page to anyone with your link. Unlisted plans only open for people you send the plan’s own link to. Circle plans are visible only to members of the Circles you pick, and only when they’re signed in. Who tapped “I’m in” or “Maybe”, who voted on dates, and how to reach them, is only ever shown to you.",
  },
  {
    q: "Do friends need an account?",
    a: "Not for public or unlisted plans: they leave a name and a way to reach them. Seeing plans shared with a Circle, or asking for a seat in a carpool, needs a free account so it’s really them.",
  },
  {
    q: "What’s a Circle?",
    a: "A private group you make, like “College” or “Climbing crew”. Add people by username or send an invite link, then share a plan with one or more Circles. Nobody outside them sees it, not even that it exists.",
  },
];

/** How it works, the Circles line and the FAQ. Static: no client JS (FAQ uses <details>). */
export function HowItWorks() {
  return (
    <>
      <section aria-labelledby="how-it-works" className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-5 py-16">
          <h2 id="how-it-works" className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="tap-card p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-primary" aria-hidden />
                </div>
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-8 flex max-w-2xl items-start gap-2 text-left text-sm sm:justify-center sm:text-center text-muted-foreground sm:items-center">
            <UsersRound className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" aria-hidden />
            <span>
              <strong className="text-foreground">Circles:</strong> share some plans only with close friends. Everyone else
              never sees them.
            </span>
          </p>
        </div>
      </section>

      <section aria-labelledby="faq" className="border-t">
        <div className="mx-auto w-full max-w-2xl px-5 py-16">
          <h2 id="faq" className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
            Questions
          </h2>
          <div className="mt-8 space-y-2">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group tap-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Still curious?{" "}
            <Link href="/demo" className="font-medium text-foreground underline underline-offset-2">
              See a live example
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
