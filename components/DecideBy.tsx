"use client";

import { useSyncExternalStore } from "react";
import { Hourglass } from "lucide-react";
import { localIsoDate } from "@/lib/dates";
import { decideByInfo, decideByStatic } from "@/lib/decide-by";
import { cn } from "@/lib/utils";

// Re-check once a minute so "today" rolls over at the viewer's midnight.
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

/**
 * "Decide by Thu · 3 days left" for a Booking Soon plan. The server (and the
 * hydration pass) render the today-independent "Decide by Dec 4", so public
 * HTML never depends on the date; the countdown and colour come from the
 * viewer's own local date in the browser.
 */
export function DecideBy({ date, category, className }: { date: string; category?: string; className?: string }) {
  const today = useSyncExternalStore(subscribe, () => localIsoDate(), () => null);
  const info = today ? decideByInfo(date, today, category) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        !info || info.tone === "normal"
          ? "bg-muted text-foreground/80"
          : info.tone === "soon"
            ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
        className,
      )}
    >
      <Hourglass className="size-3" aria-hidden />
      {info ? info.text : decideByStatic(date, category)}
    </span>
  );
}
