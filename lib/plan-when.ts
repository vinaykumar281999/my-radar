import { addDays, formatDateRange, isoFromParts, localIsoDate, toUtcDate } from "@/lib/dates";
import type { Plan, Timeframe } from "@/lib/types";

/**
 * "When is this plan?" for the owner's dashboard, relative to today.
 *
 * A plan's stored timeframe ("This Month") was picked relative to the day it
 * was created, so it goes stale: a "Next Month" plan made in October is "This
 * Month" in November. Everything here re-anchors it at created_at and labels
 * it against today. Free-text dates like "Nov25-30" are read as real dates
 * when they're unambiguous, and shown as "Nov 25–30".
 *
 * "Today" and the day a plan was made are calendar dates in the viewer's time
 * zone (pass it as timeZone; omitted, it's the zone of whoever runs this). At
 * 11pm on Nov 30 in Denver it's still November, even though it's Dec 1 in UTC.
 */

export type PlanWhenInput = Pick<Plan, "timeframe" | "specific_dates" | "start_date" | "end_date" | "created_at"> &
  Partial<Pick<Plan, "departs_at">>;

export type PlanWhen = {
  /** "Nov 25–30", "This Month", "Dec 2026"… */
  label: string;
  /** Known start/end dates (stored, or read from the free-text dates). */
  dates: { start: string; end: string } | null;
  /** specific_dates text that couldn't be read as dates (shown as-is). */
  rawDates: string | null;
  /** Everything about it is before today. */
  past: boolean;
  /** For ordering: the first day it could happen, never earlier than today. */
  sortKey: string;
  /** The last day it could happen. */
  lastDay: string;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const DASH = String.raw`\s*(?:-|–|—|to|thru|through)\s*`;
const YEAR = String.raw`(?:,?\s*(\d{4}))?`;
// "Dec 12", "Nov25-30", "Nov 25 – 30", "Nov 28 - Dec 2", each with an optional year.
const SINGLE_RE = new RegExp(String.raw`^${MONTH}\s*${DAY}${YEAR}$`, "i");
const SAME_MONTH_RE = new RegExp(String.raw`^${MONTH}\s*${DAY}${DASH}${DAY}${YEAR}$`, "i");
const TWO_MONTH_RE = new RegExp(String.raw`^${MONTH}\s*${DAY}${DASH}${MONTH}\s*${DAY}${YEAR}$`, "i");

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

/** A real calendar date, or null ("Feb 30"). */
function validIso(year: number, month: number, day: number) {
  if (day < 1 || day > 31) return null;
  const iso = isoFromParts(year, month, day);
  return toUtcDate(iso).getUTCDate() === day ? iso : null;
}

/**
 * Reads free-text dates when the whole text is a date or a range. Without a
 * year, the dates are the first ones on or after the month the plan was made.
 */
export function parseLooseDates(text: string | null | undefined, madeOn: string): { start: string; end: string } | null {
  const s = text?.trim().replace(/\s+/g, " ");
  if (!s) return null;
  const ref = toUtcDate(madeOn);
  const refYear = ref.getUTCFullYear();
  const refMonth = ref.getUTCMonth();
  const yearFor = (month: number, explicit?: string) => (explicit ? Number(explicit) : month < refMonth ? refYear + 1 : refYear);

  let m = TWO_MONTH_RE.exec(s);
  if (m) {
    const [sm, sd, em, ed] = [monthIndex(m[1]), Number(m[2]), monthIndex(m[3]), Number(m[4])];
    // With an explicit year it belongs to the end date ("Dec 30 - Jan 2, 2027").
    const endYear = m[5] ? Number(m[5]) : null;
    const startYear = endYear != null ? (em < sm ? endYear - 1 : endYear) : yearFor(sm);
    const start = validIso(startYear, sm, sd);
    const end = validIso(endYear ?? (em < sm ? startYear + 1 : startYear), em, ed);
    return start && end && end >= start ? { start, end } : null;
  }
  m = SAME_MONTH_RE.exec(s);
  if (m) {
    const month = monthIndex(m[1]);
    const year = yearFor(month, m[4]);
    const start = validIso(year, month, Number(m[2]));
    const end = validIso(year, month, Number(m[3]));
    return start && end && end >= start ? { start, end } : null;
  }
  m = SINGLE_RE.exec(s);
  if (m) {
    const month = monthIndex(m[1]);
    const start = validIso(yearFor(month, m[3]), month, Number(m[2]));
    return start ? { start, end: start } : null;
  }
  return null;
}

const monthYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function monthStart(iso: string, plus = 0) {
  const d = toUtcDate(iso);
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + plus, 1);
}

function monthEnd(iso: string, plus = 0) {
  const d = toUtcDate(iso);
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + plus + 1, 0);
}

/** The stretch of days a timeframe meant on the day it was picked. */
export function timeframePeriod(timeframe: Timeframe, madeOn: string): { start: string; end: string } {
  const d = toUtcDate(madeOn);
  switch (timeframe) {
    case "This Weekend":
      return { start: madeOn, end: addDays(madeOn, (7 - d.getUTCDay()) % 7) };
    case "This Month":
      return { start: madeOn, end: monthEnd(madeOn) };
    case "Next Month":
      return { start: monthStart(madeOn, 1), end: monthEnd(madeOn, 1) };
    case "This Quarter": {
      const q = Math.floor(d.getUTCMonth() / 3);
      return { start: madeOn, end: isoFromParts(d.getUTCFullYear(), q * 3 + 3, 0) };
    }
    case "Later This Year":
      return { start: madeOn, end: isoFromParts(d.getUTCFullYear(), 11, 31) };
  }
}

function monthsBetween(from: string, to: string) {
  const a = toUtcDate(from);
  const b = toUtcDate(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** What to call a timeframe period today. */
function periodLabel(timeframe: Timeframe, period: { start: string; end: string }, today: string) {
  const past = period.end < today;
  switch (timeframe) {
    case "This Weekend": {
      if (!past) return "This Weekend";
      const saturday = addDays(period.end, toUtcDate(period.end).getUTCDay() === 0 ? -1 : 0);
      return `Weekend of ${shortFmt.format(toUtcDate(saturday))}`;
    }
    case "This Month":
    case "Next Month": {
      const ahead = monthsBetween(today, period.end);
      if (ahead === 0) return "This Month";
      if (ahead === 1) return "Next Month";
      return monthYearFmt.format(toUtcDate(period.end));
    }
    case "This Quarter": {
      if (!past) return "This Quarter";
      const end = toUtcDate(period.end);
      return `Q${Math.floor(end.getUTCMonth() / 3) + 1} ${end.getUTCFullYear()}`;
    }
    case "Later This Year":
      return past ? String(toUtcDate(period.end).getUTCFullYear()) : "Later This Year";
  }
}

export function planWhen(plan: PlanWhenInput, today = localIsoDate(), timeZone?: string): PlanWhen {
  const madeOn = localIsoDate(new Date(plan.created_at), timeZone);

  if (plan.departs_at) {
    const day = localIsoDate(new Date(plan.departs_at), timeZone);
    return { label: "", dates: { start: day, end: day }, rawDates: null, past: day < today, sortKey: day < today ? today : day, lastDay: day };
  }

  const parsed = plan.start_date ? null : parseLooseDates(plan.specific_dates, madeOn);
  const dates = plan.start_date ? { start: plan.start_date, end: plan.end_date ?? plan.start_date } : parsed;
  if (dates) {
    return {
      label: formatDateRange(dates.start, dates.end),
      dates,
      // Stored dates win; free text that duplicates them isn't repeated.
      rawDates: null,
      past: dates.end < today,
      sortKey: dates.start < today ? today : dates.start,
      lastDay: dates.end,
    };
  }

  const period = timeframePeriod(plan.timeframe, madeOn);
  return {
    label: periodLabel(plan.timeframe, period, today),
    dates: null,
    rawDates: plan.specific_dates?.trim() || null,
    past: period.end < today,
    sortKey: period.start < today ? today : period.start,
    lastDay: period.end,
  };
}

/**
 * Soonest first. Plans with real dates go before vaguer ones on the same day,
 * newest first after that. Plans that are already over go last, latest first.
 */
export function sortByWhen<T extends PlanWhenInput>(plans: T[], today = localIsoDate(), timeZone?: string): T[] {
  const keyed = plans.map((plan) => ({ plan, when: planWhen(plan, today, timeZone) }));
  return keyed
    .sort((a, b) => {
      if (a.when.past !== b.when.past) return a.when.past ? 1 : -1;
      if (a.when.past) return b.when.lastDay.localeCompare(a.when.lastDay) || b.plan.created_at.localeCompare(a.plan.created_at);
      return (
        a.when.sortKey.localeCompare(b.when.sortKey) ||
        Number(!a.when.dates) - Number(!b.when.dates) ||
        (a.when.dates && b.when.dates ? a.when.dates.start.localeCompare(b.when.dates.start) : 0) ||
        b.plan.created_at.localeCompare(a.plan.created_at)
      );
    })
    .map((k) => k.plan);
}
