"use client";

import { Suspense, createContext, use, useState } from "react";
import { io } from "next/cache";
import { Avatar } from "@/components/Avatar";
import { DemoPlanCard } from "@/components/demo/DemoPlanCard";
import { STATUS_STYLES } from "@/components/plan-meta";
import { localIsoDate } from "@/lib/dates";
import { DEMO_HOST, demoPlans, demoTabs } from "@/lib/demo";
import { STATUSES, type Status, type Timeframe } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The landing hero's interactive bits share one piece of state: the status of
 * the first card in the phone, set by the pills next to the copy.
 */
const DemoStatus = createContext<{ status: Status; setStatus: (s: Status) => void }>({
  status: "Locked In",
  setStatus: () => {},
});

export function HeroDemoProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("Locked In");
  return <DemoStatus value={{ status, setStatus }}>{children}</DemoStatus>;
}

/** The three status pills: they switch the first card in the phone. */
export function DemoStatusSwitch({ className }: { className?: string }) {
  const { status, setStatus } = use(DemoStatus);
  return (
    <div role="group" aria-label="Try a status on the first plan" className={cn("flex flex-wrap gap-2", className)}>
      {STATUSES.map((s) => {
        const active = s === status;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            onClick={() => setStatus(s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset transition-all",
              STATUS_STYLES[s].pill,
              active ? "scale-105 shadow-sm ring-2" : "opacity-55 hover:opacity-90",
            )}
          >
            <span className={cn("size-1.5 rounded-full", STATUS_STYLES[s].dot)} aria-hidden />
            {s}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Phone-framed mini Radar with made-up plans. Dates are computed from the
 * viewer's own "today" in the browser: io() keeps the clock read out of the
 * prerendered page, which ships the frame below instead.
 */
export function DemoPhone() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-orange-400/30 blur-2xl" />
      <div className="rounded-[2.25rem] border-[6px] border-foreground/90 bg-background p-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/15" />
        <div className="flex flex-col items-center text-center">
          <Avatar name={DEMO_HOST.name} className="size-14 text-lg" />
          <p className="mt-2 font-bold">{DEMO_HOST.name}</p>
          <p className="text-xs text-muted-foreground">
            @{DEMO_HOST.username} · {DEMO_HOST.bio}
          </p>
        </div>
        <Suspense fallback={<PhoneFeedPlaceholder />}>
          <PhoneFeed />
        </Suspense>
      </div>
      {/* Out of the flow, so the grid centres the phone itself against the copy. */}
      <p className="absolute inset-x-0 top-full mt-4 text-center text-xs text-muted-foreground">
        ↑ Try it — tap &ldquo;I&apos;m Interested&rdquo;
      </p>
    </div>
  );
}

function PhoneFeed() {
  use(io());
  const plans = demoPlans(localIsoDate());
  const tabs = demoTabs(plans);
  const { status } = use(DemoStatus);
  const [tab, setTab] = useState<Timeframe | "All">("All");
  const [joined, setJoined] = useState<Set<string>>(() => new Set());
  const visible = tab === "All" ? plans : plans.filter((p) => p.timeframe === tab);

  return (
    <>
      <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {/* Tall enough for the first card plus the top of the next one. */}
      <div className="mt-2 h-[400px] space-y-2.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {visible.map((plan) => (
          <DemoPlanCard
            key={plan.id}
            plan={plan}
            status={plan.id === plans[0].id ? status : plan.status}
            joined={joined.has(plan.id)}
            onJoin={() => setJoined((j) => new Set(j).add(plan.id))}
            compact
          />
        ))}
      </div>
    </>
  );
}

/** Same footprint as the feed, so nothing shifts when it fills in. */
function PhoneFeedPlaceholder() {
  return (
    <div aria-hidden>
      <div className="mt-3 flex gap-1 pb-1">
        {[38, 92, 80].map((w) => (
          <span key={w} className="h-[22px] shrink-0 rounded-full bg-muted" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-2 h-[400px] space-y-2.5 overflow-hidden">
        <div className="h-[218px] rounded-2xl border bg-card" />
        <div className="h-[218px] rounded-2xl border bg-card" />
      </div>
    </div>
  );
}
