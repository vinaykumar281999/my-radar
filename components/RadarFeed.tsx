"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { PlanCard } from "@/components/PlanCard";
import { useViewer, useViewerStatus } from "@/components/ViewerContext";
import { createClient } from "@/lib/supabase/client";
import { groupByTimeframe, type Plan } from "@/lib/types";

export type SharedPlan = Plan & { shared_via: string[] };

/**
 * A profile's plans grouped by timeframe. The server passes only public plans,
 * so the server-rendered HTML is the same for every visitor. Plans shared with
 * a signed-in member's circles are added here, in the browser, under RLS.
 */
export function RadarFeed({
  ownerId,
  hostName,
  hostUsername,
  publicPlans,
}: {
  ownerId: string;
  hostName: string;
  hostUsername: string;
  publicPlans: Plan[];
}) {
  const viewer = useViewer();
  const shared = useSharedPlans(ownerId, viewer?.id ?? null);
  const sharedVia = new Map(shared.map((p) => [p.id, p.shared_via]));
  const groups = groupByTimeframe([...publicPlans, ...shared]);

  if (groups.length === 0) {
    return (
      <div className="tap-card mt-8 px-6 py-10 text-center">
        <p className="text-3xl">🛰️</p>
        <p className="mt-3 font-semibold">Nothing on the radar yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hostName.split(" ")[0]} hasn&apos;t posted any plans. Check back soon!
        </p>
      </div>
    );
  }

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
              <PlanCard
                key={plan.id}
                plan={plan}
                hostName={hostName}
                hostUsername={hostUsername}
                sharedVia={sharedVia.get(plan.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function useSharedPlans(ownerId: string, viewerId: string | null) {
  const [loaded, setLoaded] = useState<{ key: string; plans: SharedPlan[] } | null>(null);
  const key = `${ownerId}:${viewerId}`;

  useEffect(() => {
    if (!viewerId || viewerId === ownerId) return;
    let cancelled = false;
    createClient()
      .rpc("get_shared_plans", { p_owner_id: ownerId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("get_shared_plans", error);
        setLoaded({ key: `${ownerId}:${viewerId}`, plans: (data as SharedPlan[] | null) ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, viewerId]);

  return loaded?.key === key ? loaded.plans : [];
}

/**
 * Shown to every signed-out visitor on every profile and plan page, whether or
 * not anything is shared, so its presence never hints that hidden plans exist.
 */
export function SharedSignInPrompt({ next, className }: { next: string; className?: string }) {
  const status = useViewerStatus();
  if (status !== "signed_out") return null;
  return (
    <p className={className}>
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Lock className="size-3" /> Sign in to see plans shared with you
      </Link>
    </p>
  );
}
