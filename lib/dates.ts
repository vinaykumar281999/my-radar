/**
 * Plan dates are all-day "YYYY-MM-DD" strings. Everything here works in UTC
 * so the server render and the browser agree (no hydration mismatches).
 */

const MS_DAY = 86_400_000;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function toUtcDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number) {
  return new Date(toUtcDate(iso).getTime() + days * MS_DAY).toISOString().slice(0, 10);
}

export function isoFromParts(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Sat, Dec 12" or "Dec 12 – Dec 15". */
export function formatDateRange(start: string, end?: string | null) {
  if (!end || end === start) return dayFmt.format(toUtcDate(start));
  return `${shortFmt.format(toUtcDate(start))} – ${shortFmt.format(toUtcDate(end))}`;
}

/** Inclusive list of days a plan covers (capped, for the month grid). */
export function daysInRange(start: string, end?: string | null, cap = 62) {
  const days = [start];
  if (!end) return days;
  for (let d = addDays(start, 1); d <= end && days.length < cap; d = addDays(d, 1)) days.push(d);
  return days;
}
