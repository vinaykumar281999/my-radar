"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryLabel, STATUS_STYLES } from "@/components/plan-meta";
import { daysInRange, formatDateRange, isoFromParts, todayIso, toUtcDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { statusLabel, type Plan } from "@/lib/types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Month grid of dated plans; tap a day to list its plans, tap a plan to edit it. */
export function MonthView({ plans, onSelect }: { plans: Plan[]; onSelect: (plan: Plan) => void }) {
  const today = todayIso();
  const [cursor, setCursor] = useState(() => {
    const t = toUtcDate(today);
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(today);

  // day "YYYY-MM-DD" -> plans covering it
  const byDay = new Map<string, Plan[]>();
  for (const plan of plans) {
    if (!plan.start_date) continue;
    for (const day of daysInRange(plan.start_date, plan.end_date)) {
      byDay.set(day, [...(byDay.get(day) ?? []), plan]);
    }
  }
  const undated = plans.filter((p) => !p.start_date).length;

  const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoFromParts(cursor.year, cursor.month, i + 1)),
  ];

  function shift(delta: number) {
    setCursor(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  const selectedPlans = byDay.get(selectedDay) ?? [];

  return (
    <div className="tap-card p-3">
      <div className="flex items-center justify-between px-1">
        <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <p className="font-bold">{monthFmt.format(new Date(Date.UTC(cursor.year, cursor.month, 1)))}</p>
        <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />;
          const dayPlans = byDay.get(day) ?? [];
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={isSelected}
              aria-label={`${formatDateRange(day)}: ${dayPlans.length} plan${dayPlans.length === 1 ? "" : "s"}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-sm transition-colors",
                isSelected ? "bg-foreground text-background" : "hover:bg-muted",
                day === today && !isSelected && "font-bold text-primary ring-1 ring-primary/40 ring-inset",
              )}
            >
              <span className="leading-none tabular-nums">{toUtcDate(day).getUTCDate()}</span>
              {dayPlans.length > 0 && (
                <span className="flex gap-0.5">
                  {dayPlans.slice(0, 3).map((p) => (
                    <span key={p.id} className={cn("size-1.5 rounded-full", STATUS_STYLES[p.status].dot)} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="px-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {formatDateRange(selectedDay)}
        </p>
        {selectedPlans.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">Nothing planned.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {selectedPlans.map((plan) => (
              <li key={plan.id}>
                <button
                  type="button"
                  onClick={() => onSelect(plan)}
                  className="w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <CategoryLabel category={plan.category} />
                  <span className="mt-0.5 block font-semibold">{plan.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateRange(plan.start_date!, plan.end_date)} · {statusLabel(plan.status, plan.category)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {undated > 0 && (
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            {undated} plan{undated === 1 ? " has" : "s have"} no dates yet, so {undated === 1 ? "it isn't" : "they aren't"} shown
            here. Add dates when editing.
          </p>
        )}
      </div>
    </div>
  );
}
