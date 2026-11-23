"use client";

import { CalendarDays, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryLabel, StatusPill } from "@/components/plan-meta";
import { demoCounts, type DemoPlan } from "@/lib/demo";
import { commitmentSummary, type Commitment, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Looks like a PlanCard, but it's only for made-up data: tapping "I'm in" or
 * "Maybe" flips it locally and bumps that count. No form, no server action,
 * no database (tests/unit/demo.test.ts checks the imports).
 */
export function DemoPlanCard({
  plan,
  status = plan.status,
  choice,
  onChoose,
  compact = false,
  className,
}: {
  plan: DemoPlan;
  /** Overrides the plan's status (the landing page's status pills). */
  status?: Status;
  /** What the visitor tapped, if anything. */
  choice: Commitment | null;
  onChoose: (choice: Commitment) => void;
  compact?: boolean;
  className?: string;
}) {
  const counts = demoCounts(plan, choice);
  const buttonSize = compact ? "h-10 text-sm" : "h-11 text-base";

  return (
    <article className={cn("tap-card", compact ? "p-3.5" : "p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <CategoryLabel category={plan.category} />
        <StatusPill status={status} className="transition-colors" />
      </div>
      <h3 className={cn("mt-2 leading-snug font-bold tracking-tight text-balance", compact ? "text-base" : "text-lg")}>
        {plan.title}
      </h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden />
        {plan.when}
      </p>
      {plan.notes && <p className="mt-2 text-sm leading-relaxed text-foreground/80">{plan.notes}</p>}
      {counts.interest_count > 0 && (
        <p className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
            <Users className="size-3" aria-hidden /> {commitmentSummary(counts)}
          </span>
        </p>
      )}
      {choice ? (
        <Button disabled variant="outline" className={cn("mt-3 w-full rounded-xl font-semibold disabled:opacity-100", buttonSize)}>
          {choice === "in" ? (
            <>
              You&apos;re in <Check />
            </>
          ) : (
            "You're a maybe 🤔"
          )}
        </Button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => onChoose("in")} className={cn("flex-[3] rounded-xl font-semibold", buttonSize)}>
            I&apos;m in 🙌
          </Button>
          <Button onClick={() => onChoose("maybe")} variant="outline" className={cn("flex-[2] rounded-xl font-semibold", buttonSize)}>
            Maybe 🤔
          </Button>
        </div>
      )}
    </article>
  );
}
