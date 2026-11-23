import { addDays, formatDateRange, isoFromParts, toUtcDate } from "@/lib/dates";
import { TIMEFRAMES, effectiveTimeframe, type Category, type Status, type Timeframe } from "@/lib/types";

/**
 * Made-up data for the landing-page phone and the /demo page. Pure: no
 * database, no real account. Dates come from `today` (the viewer's local
 * date), so the tab a card sits under always matches the date printed on it.
 */

export type DemoPlan = {
  id: string;
  title: string;
  category: Category;
  status: Status;
  notes: string | null;
  start_date: string;
  end_date: string | null;
  /** Extra text after the date, e.g. a time. */
  time?: string;
  /** People already interested (before the visitor taps). */
  interested: number;
  /** Which tab it falls under today. */
  timeframe: Timeframe;
  /** "Sat, Nov 28 · 5:30 AM", "Dec 12–15"… */
  when: string;
};

export const DEMO_HOST = {
  name: "Maya Chen",
  username: "maya",
  bio: "Always down for a concert or weekend trail",
};

/** The coming Saturday, or today if it's already the weekend (Sat/Sun). */
function weekendDay(today: string) {
  const dow = toUtcDate(today).getUTCDay();
  if (dow === 6 || dow === 0) return today;
  return addDays(today, 6 - dow);
}

export function demoPlans(today: string): DemoPlan[] {
  const t = toUtcDate(today);
  const hike = weekendDay(today);
  // The Friday after the hike: at most 11 days out, so always before the trip
  // (the 12th of next month is at least 12 days out).
  const concert = addDays(hike, 6);
  const tripStart = isoFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, 12);
  const tripEnd = addDays(tripStart, 3);

  const plans: Omit<DemoPlan, "timeframe" | "when">[] = [
    {
      id: "demo-hike",
      title: "Sunrise hike at Mt. Tam",
      category: "Weekend",
      status: "Locked In",
      notes: "Carpooling from the Mission — 2 seats left",
      start_date: hike,
      end_date: null,
      time: "5:30 AM",
      interested: 3,
    },
    {
      id: "demo-concert",
      title: "Neon Tides at the Bowl",
      category: "Concert",
      status: "Booking Soon",
      notes: "Presale Thursday. Who's in?",
      start_date: concert,
      end_date: null,
      interested: 2,
    },
    {
      id: "demo-trip",
      title: "Zion National Park camping",
      category: "Trip",
      status: "Just an Idea",
      notes: null,
      start_date: tripStart,
      end_date: tripEnd,
      interested: 0,
    },
  ];

  return plans.map((p) => ({
    ...p,
    // Same bucketing as real profiles use.
    timeframe: effectiveTimeframe({ timeframe: "This Month", created_at: today, start_date: p.start_date }, today),
    when: `${formatDateRange(p.start_date, p.end_date)}${p.time ? ` · ${p.time}` : ""}`,
  }));
}

/** "All" plus only the tabs that have a plan today, in the usual order. */
export function demoTabs(plans: Pick<DemoPlan, "timeframe">[]): ("All" | Timeframe)[] {
  return ["All", ...TIMEFRAMES.filter((tf) => plans.some((p) => p.timeframe === tf))];
}
