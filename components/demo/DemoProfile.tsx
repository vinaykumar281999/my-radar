"use client";

import { Suspense, use, useState } from "react";
import { io } from "next/cache";
import { DemoPlanCard } from "@/components/demo/DemoPlanCard";
import { Skeleton } from "@/components/ui/skeleton";
import { localIsoDate } from "@/lib/dates";
import { demoPlans } from "@/lib/demo";
import { TIMEFRAMES } from "@/lib/types";

/** The demo profile's plans, grouped like a real profile. Dates come from the viewer's today. */
export function DemoProfileFeed() {
  return (
    <Suspense fallback={<FeedPlaceholder />}>
      <Feed />
    </Suspense>
  );
}

function Feed() {
  use(io());
  const plans = demoPlans(localIsoDate());
  const [joined, setJoined] = useState<Set<string>>(() => new Set());
  const groups = TIMEFRAMES.map((timeframe) => ({ timeframe, plans: plans.filter((p) => p.timeframe === timeframe) })).filter(
    (g) => g.plans.length > 0,
  );

  return (
    <div className="mt-8 space-y-8">
      {groups.map((group) => (
        <section key={group.timeframe} aria-labelledby={`tf-${group.timeframe}`}>
          <h2
            id={`tf-${group.timeframe}`}
            className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            {group.timeframe}
            <span className="h-px flex-1 bg-border" />
          </h2>
          <div className="space-y-3">
            {group.plans.map((plan) => (
              <DemoPlanCard
                key={plan.id}
                plan={plan}
                joined={joined.has(plan.id)}
                onJoin={() => setJoined((j) => new Set(j).add(plan.id))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FeedPlaceholder() {
  return (
    <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
