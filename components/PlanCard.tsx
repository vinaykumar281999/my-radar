"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, CopyPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CategoryLabel, ChainPill, StatusPill } from "@/components/plan-meta";
import { InterestModal } from "@/components/InterestModal";
import { useViewer } from "@/components/ViewerContext";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

type PlanCardProps = {
  plan: Pick<Plan, "id" | "title" | "category" | "timeframe" | "specific_dates" | "status" | "notes"> &
    Partial<Pick<Plan, "user_id" | "suggested_by_handle" | "chained_from_plan_id">>;
  hostName: string;
  /** Host's username — enables "Copy to my Radar" attribution. */
  hostUsername?: string;
  demo?: boolean;
  className?: string;
};

export function PlanCard({ plan, hostName, hostUsername, demo, className }: PlanCardProps) {
  const [open, setOpen] = useState(false);
  const viewer = useViewer();
  const canCopy = !demo && !!viewer && !!hostUsername && viewer.id !== plan.user_id;

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

      <ChainPill
        plan={{
          suggested_by_handle: plan.suggested_by_handle ?? null,
          chained_from_plan_id: plan.chained_from_plan_id ?? null,
        }}
        className="mt-2"
      />

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setOpen(true)} className="h-11 flex-1 rounded-xl text-base font-semibold">
          I&apos;m Interested 👋
        </Button>
        {canCopy && <CopyToRadarButton plan={plan} viewerId={viewer.id} hostUsername={hostUsername} />}
      </div>

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

function CopyToRadarButton({
  plan,
  viewerId,
  hostUsername,
}: {
  plan: PlanCardProps["plan"];
  viewerId: string;
  hostUsername: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function copy() {
    setState("pending");
    const { error } = await createClient()
      .from("plans")
      .insert({
        user_id: viewerId,
        title: plan.title,
        category: plan.category,
        timeframe: plan.timeframe,
        specific_dates: plan.specific_dates,
        notes: plan.notes,
        status: "Just an Idea",
        chained_from_plan_id: plan.id,
        suggested_by_handle: `@${hostUsername}`,
      });
    if (error) {
      console.error(error);
      setState("idle");
      toast.error("Couldn't copy that plan.");
      return;
    }
    setState("done");
    toast.success("Added to your Radar", {
      action: { label: "View", onClick: () => router.push("/dashboard") },
    });
  }

  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={copy}
      disabled={state !== "idle"}
      className="size-11 rounded-xl"
      aria-label={state === "done" ? "Copied to your Radar" : "Copy to my Radar"}
      title="Copy to my Radar"
    >
      {state === "pending" ? <Loader2 className="animate-spin" /> : state === "done" ? <Check /> : <CopyPlus />}
    </Button>
  );
}

