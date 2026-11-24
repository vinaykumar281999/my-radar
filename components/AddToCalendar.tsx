"use client";

import { CalendarPlus } from "lucide-react";
import { CATEGORY_EMOJI } from "@/components/plan-meta";
import { useOrigin } from "@/hooks/use-origin";
import { buildCalendar, googleCalendarUrl, type IcsEvent } from "@/lib/ics";
import { cn } from "@/lib/utils";
import { statusLabel, type Plan } from "@/lib/types";
import { carpoolExtras } from "@/lib/carpool";

type CalendarPlan = Pick<Plan, "id" | "title" | "category" | "notes" | "status"> & {
  start_date: string;
  end_date?: string | null;
  origin?: string | null;
  destination?: string | null;
  departs_at?: string | null;
  departs_tz?: string | null;
  round_trip?: boolean | null;
  returns_at?: string | null;
  gas_split?: number | null;
  gas_currency?: string | null;
  stops?: string | null;
};

/** "Add to calendar: Google · .ics" for a dated plan. */
export function AddToCalendar({
  plan,
  hostName,
  hostUsername,
  className,
}: {
  plan: CalendarPlan;
  hostName: string;
  hostUsername?: string;
  className?: string;
}) {
  const origin = useOrigin();
  const event: IcsEvent = {
    uid: `${plan.id}@radar`,
    title: `${CATEGORY_EMOJI[plan.category]} ${plan.title}`,
    start: plan.start_date,
    end: plan.end_date,
    // Carpools are timed (departure), everything else is all-day.
    startAt: plan.category === "Carpool" ? plan.departs_at : null,
    description: [
      plan.category === "Carpool" && plan.origin && plan.destination ? `${plan.origin} → ${plan.destination}` : null,
      ...(plan.category === "Carpool" ? carpoolExtras(plan) : []),
      plan.notes,
      `On ${hostName}'s Radar (${statusLabel(plan.status, plan.category)})`,
    ]
      .filter(Boolean)
      .join("\n"),
    url: origin && hostUsername ? `${origin}/${hostUsername}/p/${plan.id}` : null,
    confirmed: plan.status === "Locked In",
  };

  function downloadIcs() {
    const url = URL.createObjectURL(new Blob([buildCalendar([event], plan.title)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.title.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "plan"}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const link = "font-semibold text-foreground underline-offset-2 hover:underline";

  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground", className)}>
      <CalendarPlus className="size-3.5" aria-hidden />
      Add to calendar:
      <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={link}>
        Google
      </a>
      <span aria-hidden>·</span>
      <button type="button" onClick={downloadIcs} className={link}>
        Apple / Outlook (.ics)
      </button>
    </p>
  );
}
