"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { PlanCard } from "@/components/PlanCard";
import { cn } from "@/lib/utils";
import type { Category, Plan, Status, Timeframe } from "@/lib/types";

type DemoPlan = Pick<Plan, "id" | "title" | "specific_dates" | "notes"> & {
  category: Category;
  status: Status;
  timeframe: Timeframe;
};

const DEMO_PLANS: DemoPlan[] = [
  {
    id: "demo-1",
    title: "Sunrise hike at Mt. Tam",
    category: "Weekend",
    timeframe: "This Weekend",
    specific_dates: "Sat 5:30am",
    status: "Locked In",
    notes: "Carpooling from the Mission — 2 seats left",
  },
  {
    id: "demo-2",
    title: "Fred again.. at the Bowl",
    category: "Concert",
    timeframe: "This Month",
    specific_dates: "Oct 18",
    status: "Booking Soon",
    notes: "Presale Thursday. Who's in?",
  },
  {
    id: "demo-3",
    title: "Zion National Park camping",
    category: "Trip",
    timeframe: "Next Month",
    specific_dates: "Nov 12–15",
    status: "Just an Idea",
    notes: null,
  },
];

/** Phone-framed, fully interactive mini Radar for the landing page. */
export function LivePreview() {
  const [tab, setTab] = useState<Timeframe | "All">("All");
  const visible = tab === "All" ? DEMO_PLANS : DEMO_PLANS.filter((p) => p.timeframe === tab);
  const tabs: (Timeframe | "All")[] = ["All", "This Weekend", "This Month", "Next Month"];

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-orange-400/30 blur-2xl" />
      <div className="rounded-[2.25rem] border-[6px] border-foreground/90 bg-background p-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/15" />
        <div className="flex flex-col items-center text-center">
          <Avatar name="Maya Chen" className="size-14 text-lg" />
          <p className="mt-2 font-bold">Maya Chen</p>
          <p className="text-xs text-muted-foreground">@maya · Always down for a concert or weekend trail</p>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-2 h-[380px] space-y-2.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          {visible.map((plan) => (
            <PlanCard key={plan.id} plan={plan} hostName="Maya Chen" demo className="p-3.5" />
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">↑ It&apos;s live — tap &ldquo;I&apos;m Interested&rdquo;</p>
    </div>
  );
}
