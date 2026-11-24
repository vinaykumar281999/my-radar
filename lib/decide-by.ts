import { toUtcDate } from "@/lib/dates";

/** "normal" → plain, "soon" → amber (2 days or fewer), "past" → grey. */
export type DecideByTone = "normal" | "soon" | "past";

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Decide by", or "Confirm seats by" for carpools. */
export function decideByPrefix(category?: string | null) {
  return category === "Carpool" ? "Confirm seats by" : "Decide by";
}

/** Today-independent label, safe for server-rendered HTML: "Decide by Dec 4". */
export function decideByStatic(decideBy: string, category?: string | null) {
  return `${decideByPrefix(category)} ${shortFmt.format(toUtcDate(decideBy))}`;
}

/**
 * The label relative to the viewer's local `today` ("YYYY-MM-DD"):
 * "Decide by Thu · 3 days left" (weekday within the coming week, else the date),
 * amber from 2 days left, grey once the day has passed.
 */
export function decideByInfo(decideBy: string, today: string, category?: string | null): { text: string; tone: DecideByTone } {
  const prefix = decideByPrefix(category);
  const days = Math.round((toUtcDate(decideBy).getTime() - toUtcDate(today).getTime()) / 86_400_000);
  const when = days >= 0 && days < 7 ? weekdayFmt.format(toUtcDate(decideBy)) : shortFmt.format(toUtcDate(decideBy));
  if (days < 0) return { text: `${prefix} ${when} · passed`, tone: "past" };
  const left = days === 0 ? "today" : days === 1 ? "1 day left" : `${days} days left`;
  return { text: `${prefix} ${when} · ${left}`, tone: days <= 2 ? "soon" : "normal" };
}
