"use client";

import { CalendarDays, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryLabel, StatusPill } from "@/components/plan-meta";
import type { DemoPlan } from "@/lib/demo";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Looks like a PlanCard, but it's only for made-up data: tapping
 * "I'm Interested" flips it locally and bumps the count. No form, no server
 * action, no database (tests/unit/demo.test.ts checks the imports).
 */
export function DemoPlanCard({
  plan,
  status = plan.status,
  joined,
  onJoin,
  compact = false,
  className,
}: {
  plan: DemoPlan;
  /** Overrides the plan's status (the landing page's status pills). */
  status?: Status;
  joined: boolean;
  onJoin: () => void;
  compact?: boolean;
  className?: string;
}) {
  const count = plan.interested + (joined ? 1 : 0);

  return (
    <article className={cn("tap-card", compact ? "p-3.5" : "p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <CategoryLabel category={plan.category} />
        <StatusPill status={status} className="transition-colors" />
      </div>
      <h3 className={cn("mt-2 leading-snug font-bold tracking-tight text-balance", compact ? "text-base" : "text-lg")}>{plan.title}</h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden />
        {plan.when}
      </p>
      {plan.notes && <p className="mt-2 text-sm leading-relaxed text-foreground/80">{plan.notes}</p>}
      {count > 0 && (
        <p className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
            <Users className="size-3" aria-hidden /> {count} interested
          </span>
        </p>
      )}
      <Button
        onClick={onJoin}
        disabled={joined}
        variant={joined ? "outline" : "default"}
        className={cn("mt-3 w-full rounded-xl font-semibold disabled:opacity-100", compact ? "h-10 text-sm" : "h-11 text-base")}
      >
        {joined ? (
          <>
            You&apos;re on the list <Check />
          </>
        ) : (
          "I'm Interested 👋"
        )}
      </Button>
    </article>
  );
}
