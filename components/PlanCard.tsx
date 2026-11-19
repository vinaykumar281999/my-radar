"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, CopyPlus, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CategoryLabel, ChainPill, FlexibleDatesLabel, StatusPill } from "@/components/plan-meta";
import { InterestModal } from "@/components/InterestModal";
import { AddToCalendar } from "@/components/AddToCalendar";
import { formatDateRange, formatDeparture } from "@/lib/dates";
import { canCopyPlan } from "@/lib/audience";
import { useViewer, useViewerStatus } from "@/components/ViewerContext";
import { CarpoolDetails } from "@/components/CarpoolDetails";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { InterestStatus, Plan, Spots } from "@/lib/types";

const REQUEST_LABEL: Record<InterestStatus, string> = {
  pending: "Requested · waiting for an answer",
  approved: "You're in ✓",
  declined: "Not this time",
  interested: "Sent ✓",
};

type PlanCardProps = {
  plan: Pick<Plan, "id" | "title" | "category" | "timeframe" | "specific_dates" | "status" | "notes"> &
    Partial<
      Pick<
        Plan,
        | "user_id"
        | "suggested_by_handle"
        | "chained_from_plan_id"
        | "start_date"
        | "end_date"
        | "dates_flexible"
        | "visibility"
        | "capacity"
        | "origin"
        | "destination"
        | "departs_at"
        | "departs_tz"
      >
    >;
  hostName: string;
  /** Host's username — enables "Copy to my Radar" attribution. */
  hostUsername?: string;
  demo?: boolean;
  /** Viewer's circles this plan is shared with ("Shared with you · College"). */
  sharedVia?: string[];
  /** Plans with spots: how many are taken. */
  spots?: Spots;
  className?: string;
};

export function PlanCard({ plan, hostName, hostUsername, demo, sharedVia, spots, className }: PlanCardProps) {
  const [open, setOpen] = useState(false);
  // Set right after sending, so the card updates without a reload.
  const [sentStatus, setSentStatus] = useState<InterestStatus | null>(null);
  const viewer = useViewer();
  const canCopy = canCopyPlan(plan, viewer?.id ?? null, { demo, hostUsername });
  const hasSpots = plan.capacity != null;
  const isCarpool = plan.category === "Carpool";
  const left = hasSpots && spots ? Math.max(0, spots.capacity - spots.taken) : null;
  const myRequest = useMyRequest(plan.id, hasSpots && !demo ? (viewer?.id ?? null) : null);
  const request = sentStatus ?? myRequest;
  const signedOut = useViewerStatus() === "signed_out";
  const seatWord = isCarpool ? "seat" : "spot";

  return (
    <article className={cn("tap-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <CategoryLabel category={plan.category} />
        <StatusPill status={plan.status} />
      </div>

      {sharedVia && (
        <p className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
          <UsersRound className="size-3 shrink-0" />
          Shared with you{sharedVia.length > 0 && ` · ${sharedVia.join(", ")}`}
        </p>
      )}

      <h3 className="mt-2 text-lg leading-snug font-bold tracking-tight text-balance">{plan.title}</h3>

      {isCarpool && plan.origin && plan.destination && (
        <p className="mt-1 text-base font-semibold">
          {plan.origin} <span className="text-muted-foreground">→</span> {plan.destination}
        </p>
      )}

      {isCarpool && plan.departs_at && plan.departs_tz ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          Leaves {formatDeparture(plan.departs_at, plan.departs_tz)}
        </p>
      ) : (plan.start_date || plan.specific_dates) && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          {plan.start_date ? formatDateRange(plan.start_date, plan.end_date) : plan.specific_dates}
        </p>
      )}

      {plan.dates_flexible && !isCarpool && <FlexibleDatesLabel className="mt-1.5 ml-2 first:ml-0" />}

      {plan.notes && <p className="mt-2 text-sm leading-relaxed text-foreground/80">{plan.notes}</p>}

      {hasSpots && left !== null && (
        <p className={cn("mt-2 text-sm font-semibold", left === 0 ? "text-muted-foreground" : "text-foreground")}>
          {left === 0 ? "Full" : `${left} of ${spots!.capacity} ${seatWord}s left`}
        </p>
      )}

      <ChainPill
        plan={{
          suggested_by_handle: plan.suggested_by_handle ?? null,
          chained_from_plan_id: plan.chained_from_plan_id ?? null,
        }}
        className="mt-2"
      />

      <div className="mt-4 flex gap-2">
        {request && hasSpots ? (
          <p className="flex h-11 flex-1 items-center justify-center rounded-xl bg-muted text-sm font-semibold">
            {REQUEST_LABEL[request]}
          </p>
        ) : isCarpool && signedOut && !demo ? (
          <Button
            render={<Link href={`/login?next=${encodeURIComponent(hostUsername ? `/${hostUsername}/p/${plan.id}` : "/")}`} />}
            nativeButton={false}
            variant="outline"
            className="h-11 flex-1 rounded-xl text-base font-semibold"
          >
            Sign in to request a seat
          </Button>
        ) : (
          <Button
            onClick={() => setOpen(true)}
            disabled={hasSpots && left === 0}
            className="h-11 flex-1 rounded-xl text-base font-semibold"
          >
            {hasSpots ? (left === 0 ? "Full" : isCarpool ? "Request a seat 🚗" : "Request a spot ✋") : "I'm Interested 👋"}
          </Button>
        )}
        {canCopy && viewer && hostUsername && (
          <CopyToRadarButton plan={plan} viewerId={viewer.id} hostUsername={hostUsername} />
        )}
      </div>

      {isCarpool && !demo && viewer && plan.user_id === viewer.id ? (
        <CarpoolDetails planId={plan.id} isOwner />
      ) : (
        isCarpool && request === "approved" && <CarpoolDetails planId={plan.id} />
      )}

      {plan.start_date && !demo && (
        <AddToCalendar
          plan={{ ...plan, start_date: plan.start_date }}
          hostName={hostName}
          hostUsername={hostUsername}
          className="mt-3"
        />
      )}

      <InterestModal
        open={open}
        onOpenChange={setOpen}
        planId={plan.id}
        planTitle={plan.title}
        hostName={hostName}
        demo={demo}
        spotRequest={hasSpots}
        seatWord={seatWord}
        onSent={() => viewer && setSentStatus(hasSpots ? "pending" : "interested")}
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
        start_date: plan.start_date ?? null,
        end_date: plan.end_date ?? null,
        dates_flexible: plan.dates_flexible ?? false,
        notes: plan.notes,
        status: "Just an Idea",
        chained_from_plan_id: plan.id,
        suggested_by_handle: `@${hostUsername}`,
      });
    if (error) {
      setState("idle");
      if (error.message.includes("copy_source_unavailable")) {
        toast.error("This plan can't be copied.");
      } else {
        console.error(error);
        toast.error("Couldn't copy that plan.");
      }
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

/** The signed-in viewer's own request on a plan with spots (RLS: only their own row). */
function useMyRequest(planId: string, viewerId: string | null) {
  const [loaded, setLoaded] = useState<{ key: string; status: InterestStatus | null } | null>(null);
  const key = `${planId}:${viewerId}`;

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    createClient()
      .from("interests")
      .select("status")
      .eq("plan_id", planId)
      .eq("user_id", viewerId)
      .maybeSingle<{ status: InterestStatus }>()
      .then(({ data }) => {
        if (!cancelled) setLoaded({ key: `${planId}:${viewerId}`, status: data?.status ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [planId, viewerId]);

  return loaded?.key === key ? loaded.status : null;
}
