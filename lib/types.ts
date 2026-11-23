import { addDays, todayIso, toUtcDate } from "@/lib/dates";

export const CATEGORIES = [
  "Trip",
  "Concert",
  "Weekend",
  "Sports",
  "Food & Nightlife",
  "Carpool",
] as const;

/** Friends can pitch any category except a carpool (someone has to be driving). */
export const PITCH_CATEGORIES = CATEGORIES.filter((c) => c !== "Carpool") as Exclude<Category, "Carpool">[];

export const TIMEFRAMES = [
  "This Weekend",
  "This Month",
  "Next Month",
  "This Quarter",
  "Later This Year",
] as const;

export const STATUSES = ["Just an Idea", "Booking Soon", "Locked In"] as const;

export const VISIBILITIES = ["public", "unlisted", "circles"] as const;

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
  /** Public hint that the dates can move (never on carpools). */
  dates_flexible: boolean;
  /** Optional number of spots; requests then need the owner's approval. */
  capacity: number | null;
  /** Carpools: public route and departure (instant + the zone it was entered in). */
  origin: string | null;
  destination: string | null;
  departs_at: string | null;
  departs_tz: string | null;
  status: Status;
  notes: string | null;
  is_archived: boolean;
  /**
   * "unlisted": only via the direct link (/username/p/id).
   * "circles": only the owner and signed-in members of its circles (plan_audiences).
   */
  visibility: Visibility;
  /** "@handle" or a first name — never a phone number (see publicAttribution). */
  suggested_by_handle: string | null;
  chained_from_plan_id: string | null;
  /** Date poll: set when the owner picked an option (the poll is then closed). */
  poll_closed_at: string | null;
  poll_picked_option_id: string | null;
  /** Booking Soon plans: an optional "decide by" date ("YYYY-MM-DD"), shown publicly. */
  decide_by: string | null;
  created_at: string;
};

export type PlanWithCount = Plan & {
  interest_count: number;
  /** Plain plans: how many of interest_count said "Maybe". */
  maybe_count: number;
  /** Date poll: options offered and people who voted (owner only). */
  poll_option_count: number;
  poll_vote_count: number;
  /** Plans with spots: approved / waiting for a decision. */
  approved_count: number;
  pending_count: number;
};

/** Totals the dashboard shows for a plan's interests / requests. */
export type LeadCounts = { interest_count: number; maybe_count: number; approved_count: number; pending_count: number };

export function countLeads(leads: (Pick<Interest, "status"> & { commitment?: Commitment })[]): LeadCounts {
  return {
    interest_count: leads.length,
    maybe_count: leads.filter((l) => l.commitment === "maybe").length,
    approved_count: leads.filter((l) => l.status === "approved").length,
    pending_count: leads.filter((l) => l.status === "pending").length,
  };
}

/** Spots for a plan with capacity; taken = approved requests. */
export type Spots = { capacity: number; taken: number };

/** "waitlisted": the plan was full; promote_waitlist moves people to "pending" in order. */
export const COMMITMENTS = ["in", "maybe"] as const;
export type Commitment = (typeof COMMITMENTS)[number];

/** "3 in · 2 maybe", "3 in", "2 maybe" or "0" for a plain plan's interest. */
export function commitmentSummary({ interest_count, maybe_count }: Pick<LeadCounts, "interest_count" | "maybe_count">) {
  const maybe = Math.min(maybe_count, interest_count);
  const yes = interest_count - maybe;
  if (interest_count === 0) return "0";
  if (maybe === 0) return `${yes} in`;
  if (yes === 0) return `${maybe} maybe`;
  return `${yes} in · ${maybe} maybe`;
}

/** What a reaction says on the owner's side: "in"/"maybe" for plain interest, else its status. */
export function reactionLabel(status: InterestStatus, commitment?: Commitment) {
  if (status === "interested") return commitment === "maybe" ? "maybe" : "in";
  return INTEREST_STATUS_LABEL[status];
}

export const INTEREST_STATUSES = ["interested", "pending", "approved", "declined", "waitlisted"] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

/** Short owner-facing label for each status (Record: a new status won't compile without one). */
export const INTEREST_STATUS_LABEL: Record<InterestStatus, string> = {
  interested: "interested",
  pending: "waiting",
  approved: "in",
  declined: "declined",
  waitlisted: "waitlist",
};

export type Interest = {
  id: string;
  plan_id: string;
  visitor_name: string;
  contact_handle: string;
  message: string | null;
  status: InterestStatus;
  user_id: string | null;
  /** "I'm in" or "Maybe" (spot and carpool requests are always "in"). */
  commitment: Commitment;
  /** Carpool requests only (always false elsewhere). */
  can_drive: boolean;
  large_bag: boolean;
  /** Set when this request was moved from the waitlist to pending. */
  promoted_at: string | null;
  created_at: string;
};

/** The owner's waitlist in line order (created_at, then id), like promote_waitlist. */
export function waitlistOrder<T extends Pick<Interest, "id" | "status" | "created_at">>(leads: T[]): T[] {
  return leads
    .filter((l) => l.status === "waitlisted")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** "2 riders can also drive · 1 big bag" for a carpool's riders. */
export function riderFlagSummary(riders: Pick<Interest, "can_drive" | "large_bag">[]) {
  const drive = riders.filter((r) => r.can_drive).length;
  const bags = riders.filter((r) => r.large_bag).length;
  const parts = [
    drive ? `${drive} ${drive === 1 ? "rider" : "riders"} can also drive` : null,
    bags ? `${bags} big ${bags === 1 ? "bag" : "bags"}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

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

export type Circle = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

/** Owner-only per-circle defaults (RLS: nobody else can read them). */
export type CircleSettings = {
  circle_id: string;
  owner_id: string;
  preselect_for_new_plans: boolean;
  default_capacity: number | null;
  default_invite_days: number;
  /** null = app default (25); 500 = no limit. */
  default_invite_max_uses: number | null;
};

/** What the plan form needs to know about each of the owner's circles. */
export type CircleOption = Pick<Circle, "id" | "name"> &
  Partial<Pick<CircleSettings, "preselect_for_new_plans" | "default_capacity">>;

export type CircleMember = {
  circle_id: string;
  user_id: string;
  added_at: string;
  /** Set when they joined through an invite link. */
  invite_id: string | null;
  seen_at: string | null;
  profiles: Pick<Profile, "username" | "display_name"> | null;
};

export type CircleInvite = {
  id: string;
  circle_id: string;
  token: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
};

/** A "joined via invite link" notice on the owner's dashboard. */
export type JoinNotice = {
  circle_id: string;
  user_id: string;
  added_at: string;
  circles: { name: string } | null;
  profiles: Pick<Profile, "username" | "display_name"> | null;
};

/** `now` is passed in (ms) so components can keep render pure. */
export function inviteIsActive(invite: Pick<CircleInvite, "revoked_at" | "expires_at" | "uses" | "max_uses">, now: number) {
  return !invite.revoked_at && new Date(invite.expires_at).getTime() > now && invite.uses < invite.max_uses;
}

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
  interests: { id: string; plan_id: string; status: InterestStatus; commitment?: Commitment }[];
};

export type PlanInput = Pick<
  Plan,
  | "title"
  | "category"
  | "timeframe"
  | "specific_dates"
  | "start_date"
  | "end_date"
  | "dates_flexible"
  | "decide_by"
  | "status"
  | "notes"
  | "visibility"
  | "capacity"
  | "origin"
  | "destination"
  | "departs_at"
  | "departs_tz"
>;

/** Carpool pickup spot and driver contact: owner + approved riders only (RLS). */
export type PlanPrivateDetails = {
  plan_id: string;
  owner_id: string;
  pickup_details: string | null;
  owner_contact: string | null;
  /** Driver's note to approved riders. */
  rider_note: string | null;
};

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export const RESERVED_USERNAMES = new Set([
  "login", "logout", "onboarding", "dashboard", "auth", "api",
  "admin", "settings", "about", "help", "radar", "_next", "join",
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
