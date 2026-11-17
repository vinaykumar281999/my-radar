import { addDays, todayIso, toUtcDate } from "@/lib/dates";

export const CATEGORIES = [
  "Trip",
  "Concert",
  "Weekend",
  "Sports",
  "Food & Nightlife",
] as const;

export const TIMEFRAMES = [
  "This Weekend",
  "This Month",
  "Next Month",
  "This Quarter",
  "Later This Year",
] as const;

export const STATUSES = ["Just an Idea", "Booking Soon", "Locked In"] as const;

export const VISIBILITIES = ["public", "unlisted"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Timeframe = (typeof TIMEFRAMES)[number];
export type Status = (typeof STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  pitches_paused: boolean;
  created_at: string;
};

export type Plan = {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  timeframe: Timeframe;
  specific_dates: string | null;
  /** All-day "YYYY-MM-DD", optional; end_date is inclusive. */
  start_date: string | null;
  end_date: string | null;
  status: Status;
  notes: string | null;
  is_archived: boolean;
  /** "unlisted" plans only show via their direct link (/username/p/id). */
  visibility: Visibility;
  /** "@handle" or a first name — never a phone number (see publicAttribution). */
  suggested_by_handle: string | null;
  chained_from_plan_id: string | null;
  created_at: string;
};

export type PlanWithCount = Plan & { interest_count: number };

export type Interest = {
  id: string;
  plan_id: string;
  visitor_name: string;
  contact_handle: string;
  message: string | null;
  created_at: string;
};

export type PitchStatus = "pending" | "accepted" | "dismissed";

export type Pitch = {
  id: string;
  target_user_id: string;
  title: string;
  category: Category;
  timeframe: Timeframe;
  pitcher_name: string;
  pitcher_handle: string;
  notes: string | null;
  status: PitchStatus;
  created_at: string;
};

export type BlockedContact = {
  id: string;
  owner_id: string;
  contact_key: string;
  label: string | null;
  created_at: string;
};

/** What block_contact() cleared: dismissed pitches and deleted interests. */
export type BlockResult = {
  pitch_ids: string[];
  interests: { id: string; plan_id: string }[];
};

export type PlanInput = Pick<
  Plan,
  | "title"
  | "category"
  | "timeframe"
  | "specific_dates"
  | "start_date"
  | "end_date"
  | "status"
  | "notes"
  | "visibility"
>;

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export const RESERVED_USERNAMES = new Set([
  "login", "logout", "onboarding", "dashboard", "auth", "api",
  "admin", "settings", "about", "help", "radar", "_next",
]);

type Sortable = Pick<Plan, "timeframe" | "created_at"> & Partial<Pick<Plan, "start_date">>;

/**
 * The bucket a plan belongs in today. Dated plans move between buckets as
 * time passes; undated (fuzzy) plans keep the timeframe they were given.
 */
export function effectiveTimeframe(plan: Sortable, today = todayIso()): Timeframe {
  const start = plan.start_date;
  if (!start || start < today) return plan.timeframe;

  const t = toUtcDate(today);
  const d = toUtcDate(start);
  const daysToSunday = (7 - t.getUTCDay()) % 7;
  const weekday = d.getUTCDay();
  if (start <= addDays(today, daysToSunday) && (weekday === 5 || weekday === 6 || weekday === 0)) {
    return "This Weekend";
  }

  const monthsAhead = (d.getUTCFullYear() - t.getUTCFullYear()) * 12 + (d.getUTCMonth() - t.getUTCMonth());
  if (monthsAhead === 0) return "This Month";
  if (monthsAhead === 1) return "Next Month";
  const sameQuarter =
    d.getUTCFullYear() === t.getUTCFullYear() && Math.floor(d.getUTCMonth() / 3) === Math.floor(t.getUTCMonth() / 3);
  return sameQuarter ? "This Quarter" : "Later This Year";
}

/** Soonest bucket first; within a bucket, dated plans by date, then newest first. */
export function sortPlans<T extends Sortable>(plans: T[], today = todayIso()): T[] {
  const rank = (p: T) => TIMEFRAMES.indexOf(effectiveTimeframe(p, today));
  return [...plans].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.start_date && b.start_date ? a.start_date.localeCompare(b.start_date) : 0) ||
      (a.start_date ? -1 : 0) - (b.start_date ? -1 : 0) ||
      b.created_at.localeCompare(a.created_at),
  );
}

export function groupByTimeframe<T extends Sortable>(plans: T[], today = todayIso()) {
  return TIMEFRAMES.map((timeframe) => ({
    timeframe,
    plans: sortPlans(
      plans.filter((p) => effectiveTimeframe(p, today) === timeframe),
      today,
    ),
  })).filter((g) => g.plans.length > 0);
}
