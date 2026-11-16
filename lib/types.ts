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

export type Category = (typeof CATEGORIES)[number];
export type Timeframe = (typeof TIMEFRAMES)[number];
export type Status = (typeof STATUSES)[number];

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Plan = {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  timeframe: Timeframe;
  specific_dates: string | null;
  status: Status;
  notes: string | null;
  is_archived: boolean;
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

export type PlanInput = Pick<
  Plan,
  "title" | "category" | "timeframe" | "specific_dates" | "status" | "notes"
>;

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export const RESERVED_USERNAMES = new Set([
  "login", "logout", "onboarding", "dashboard", "auth", "api",
  "admin", "settings", "about", "help", "radar", "_next",
]);

/** Sort plans soonest-timeframe first, newest first within a timeframe. */
export function sortPlans<T extends Plan>(plans: T[]): T[] {
  return [...plans].sort(
    (a, b) =>
      TIMEFRAMES.indexOf(a.timeframe) - TIMEFRAMES.indexOf(b.timeframe) ||
      b.created_at.localeCompare(a.created_at),
  );
}

export function groupByTimeframe<T extends Plan>(plans: T[]) {
  return TIMEFRAMES.map((timeframe) => ({
    timeframe,
    plans: sortPlans(plans.filter((p) => p.timeframe === timeframe)),
  })).filter((g) => g.plans.length > 0);
}
