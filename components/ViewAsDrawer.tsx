"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanCard } from "@/components/PlanCard";
import { createClient } from "@/lib/supabase/client";
import { groupByTimeframe, type Circle, type Plan } from "@/lib/types";

export type ViewAsMember = { id: string; username: string; display_name: string; circleIds: string[] };

const SIGNED_OUT = "signed-out";

/**
 * "View as": the plans a given circle member (or a signed-out visitor) would
 * see listed on your page. Uses preview_visible_plans, the same rule as RLS,
 * so the preview can't drift from what people actually see.
 */
export function ViewAsDrawer({
  open,
  onOpenChange,
  hostName,
  hostUsername,
  members,
  circles,
  audiences,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostName: string;
  hostUsername: string;
  members: ViewAsMember[];
  circles: Pick<Circle, "id" | "name">[];
  /** plan id -> circle ids */
  audiences: Record<string, string[]>;
}) {
  const [as, setAs] = useState<string>(SIGNED_OUT);
  const [loaded, setLoaded] = useState<{ as: string; plans: Plan[] } | null>(null);
  const plans = loaded?.as === as ? loaded.plans : null;
  const member = members.find((m) => m.id === as) ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    createClient()
      .rpc("preview_visible_plans", { p_member_id: as === SIGNED_OUT ? null : as })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("preview_visible_plans", error);
        setLoaded({ as, plans: (data as Plan[] | null) ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, as]);

  // Which of this member's circles a plan reaches them through (for the label).
  const sharedVia = (planId: string) =>
    member
      ? (audiences[planId] ?? [])
          .filter((id) => member.circleIds.includes(id))
          .map((id) => circles.find((c) => c.id === id)?.name)
          .filter((n): n is string => !!n)
      : [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[520px]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-lg font-bold">
            <Eye className="size-5" /> View your page as…
          </DrawerTitle>
          <DrawerDescription className="text-left">
            Exactly the plans they&apos;d see listed. Unlisted plans never appear here; they&apos;re link-only.
          </DrawerDescription>
          <select
            value={as}
            onChange={(e) => setAs(e.target.value)}
            aria-label="View as"
            className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-base"
          >
            <option value={SIGNED_OUT}>Someone signed out (or not in your circles)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                @{m.username}
                {m.display_name ? ` · ${m.display_name}` : ""}
              </option>
            ))}
          </select>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
          {plans === null ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-36 w-full rounded-2xl" />
            </div>
          ) : plans.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">They&apos;d see no plans.</p>
          ) : (
            <div className="space-y-6">
              {groupByTimeframe(plans).map((group) => (
                <section key={group.timeframe}>
                  <h3 className="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">{group.timeframe}</h3>
                  <div className="space-y-3">
                    {group.plans.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        hostName={hostName}
                        hostUsername={hostUsername}
                        sharedVia={plan.visibility === "circles" ? sharedVia(plan.id) : undefined}
                        demo
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
