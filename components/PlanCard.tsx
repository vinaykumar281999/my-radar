"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryLabel, StatusPill } from "@/components/plan-meta";
import { InterestModal } from "@/components/InterestModal";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

type PlanCardProps = {
  plan: Pick<Plan, "id" | "title" | "category" | "specific_dates" | "status" | "notes">;
  hostName: string;
  demo?: boolean;
  className?: string;
};

export function PlanCard({ plan, hostName, demo, className }: PlanCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <article className={cn("tap-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <CategoryLabel category={plan.category} />
        <StatusPill status={plan.status} />
      </div>

      <h3 className="mt-2 text-lg leading-snug font-bold tracking-tight text-balance">{plan.title}</h3>

      {plan.specific_dates && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          {plan.specific_dates}
        </p>
      )}

      {plan.notes && <p className="mt-2 text-sm leading-relaxed text-foreground/80">{plan.notes}</p>}

      <Button
        onClick={() => setOpen(true)}
        className="mt-4 h-11 w-full rounded-xl text-base font-semibold"
      >
        I&apos;m Interested 👋
      </Button>

      <InterestModal
        open={open}
        onOpenChange={setOpen}
        planId={plan.id}
        planTitle={plan.title}
        hostName={hostName}
        demo={demo}
      />
    </article>
  );
}
