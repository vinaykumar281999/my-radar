"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { PlanCard } from "@/components/PlanCard";
import { useViewer, useViewerStatus } from "@/components/ViewerContext";
import { createClient } from "@/lib/supabase/client";
import { groupByTimeframe, type InterestStatus, type Plan, type Spots } from "@/lib/types";

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
  publicSpots,
}: {
  ownerId: string;
  hostName: string;
  hostUsername: string;
  publicPlans: Plan[];
  /** Spots for public plans, counted anonymously on the server. */
  publicSpots: Record<string, Spots>;
}) {
  const viewer = useViewer();
  const { plans: shared, spots: sharedSpots, requests } = useViewerExtras(ownerId, viewer?.id ?? null, publicPlans);
  const spots = { ...publicSpots, ...sharedSpots };
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
                spots={spots[plan.id]}
                myRequest={requests[plan.id]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type Extras = { plans: SharedPlan[]; spots: Record<string, Spots>; requests: Record<string, InterestStatus> };
const NONE: Extras = { plans: [], spots: {}, requests: {} };

/**
 * For a signed-in visitor (not the owner): plans shared with their circles,
 * spot counts for those, and their own requests on any of these plans.
 * All read with their session, so RLS decides what comes back.
 */
function useViewerExtras(ownerId: string, viewerId: string | null, publicPlans: Plan[]): Extras {
  const [loaded, setLoaded] = useState<{ key: string; extras: Extras } | null>(null);
  const key = `${ownerId}:${viewerId}`;
  const publicIds = publicPlans.map((p) => p.id).join(",");

  useEffect(() => {
    if (!viewerId || viewerId === ownerId) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("get_shared_plans", { p_owner_id: ownerId });
      if (error) console.error("get_shared_plans", error);
      const plans = (data as SharedPlan[] | null) ?? [];
      const withSpots = plans.filter((p) => p.capacity != null).map((p) => p.id);
      const allIds = [...(publicIds ? publicIds.split(",") : []), ...plans.map((p) => p.id)];
      const [{ data: spotRows }, { data: mine }] = await Promise.all([
        withSpots.length
          ? supabase.rpc("plan_spots", { p_plan_ids: withSpots })
          : Promise.resolve({ data: [] as { plan_id: string; capacity: number; taken: number }[] }),
        allIds.length
          ? supabase.from("interests").select("plan_id, status").in("plan_id", allIds).eq("user_id", viewerId)
          : Promise.resolve({ data: [] as { plan_id: string; status: InterestStatus }[] }),
      ]);
      if (cancelled) return;
      setLoaded({
        key: `${ownerId}:${viewerId}`,
        extras: {
          plans,
          spots: Object.fromEntries(
            ((spotRows as { plan_id: string; capacity: number; taken: number }[] | null) ?? []).map((r) => [
              r.plan_id,
              { capacity: r.capacity, taken: r.taken },
            ]),
          ),
          requests: Object.fromEntries(
            ((mine as { plan_id: string; status: InterestStatus }[] | null) ?? []).map((r) => [r.plan_id, r.status]),
          ),
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, viewerId, publicIds]);

  return loaded?.key === key ? loaded.extras : NONE;
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
