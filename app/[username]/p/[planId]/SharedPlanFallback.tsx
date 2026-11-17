"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanCard } from "@/components/PlanCard";
import { SharedSignInPrompt, type SharedPlan } from "@/components/RadarFeed";
import { useViewer, useViewerStatus } from "@/components/ViewerContext";
import { createClient } from "@/lib/supabase/client";
import type { Plan, Spots } from "@/lib/types";

/**
 * The anonymous server read found no public/unlisted plan. If the visitor is a
 * signed-in member of the plan's circles (or its owner), load it with their
 * session; RLS decides. Everyone else sees the same "isn't available" screen a
 * nonexistent plan gets.
 */
export function SharedPlanFallback({
  planId,
  ownerId,
  hostName,
  hostUsername,
}: {
  planId: string;
  ownerId: string;
  hostName: string;
  hostUsername: string;
}) {
  const status = useViewerStatus();
  const viewer = useViewer();
  const [result, setResult] = useState<{ plan: SharedPlan | null; spots?: Spots; forViewer: string } | null>(null);
  const current = viewer && result?.forViewer === viewer.id ? result : null;

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const supabase = createClient();
    const load = async (): Promise<SharedPlan | null> => {
      if (viewer.id === ownerId) {
        // Owner opening their own circle plan's link: plain read, RLS allows it.
        const { data } = await supabase.from("plans").select("*").eq("id", planId).maybeSingle<Plan>();
        return data && !data.is_archived ? { ...data, shared_via: [] } : null;
      }
      const { data, error } = await supabase.rpc("get_shared_plan", { p_plan_id: planId });
      if (error) console.error("get_shared_plan", error);
      return (data as SharedPlan | null) ?? null;
    };
    load().then(async (loadedPlan) => {
      // The plan must belong to the user in the URL.
      const plan = loadedPlan && loadedPlan.user_id === ownerId ? loadedPlan : null;
      let spots: Spots | undefined;
      if (plan?.capacity != null) {
        const { data } = await supabase.rpc("plan_spots", { p_plan_ids: [plan.id] });
        const row = (data as { capacity: number; taken: number }[] | null)?.[0];
        if (row) spots = { capacity: row.capacity, taken: row.taken };
      }
      if (!cancelled) setResult({ plan, spots, forViewer: viewer.id });
    });
    return () => {
      cancelled = true;
    };
  }, [viewer, planId, ownerId]);

  if (status === "loading" || (status === "ready" && !current)) {
    return <Skeleton className="mt-5 h-48 w-full rounded-2xl" aria-label="Loading" />;
  }

  if (current?.plan) {
    return (
      <PlanCard
        plan={current.plan}
        hostName={hostName}
        hostUsername={hostUsername}
        sharedVia={viewer?.id === ownerId ? undefined : current.plan.shared_via}
        spots={current.spots}
        className="mt-5"
      />
    );
  }

  return <PlanUnavailable next={`/${hostUsername}/p/${planId}`} />;
}

export function PlanUnavailable({ next }: { next?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-5xl">🗓️</p>
      <h1 className="mt-4 text-2xl font-bold">This plan isn&apos;t available</h1>
      <p className="mt-2 text-muted-foreground">It may have been archived or deleted.</p>
      <Button render={<Link href="/" />} nativeButton={false} variant="outline" className="mt-6 h-11 rounded-full px-6">
        What&apos;s Radar?
      </Button>
      {next && <SharedSignInPrompt next={next} className="mt-6" />}
    </div>
  );
}
