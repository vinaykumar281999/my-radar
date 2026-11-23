/**
 * Plan dates are all-day "YYYY-MM-DD" strings. Everything here works in UTC
 * so the server render and the browser agree (no hydration mismatches).
 */

const MS_DAY = 86_400_000;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in UTC. Server renders use this so every request agrees. */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The calendar date ("YYYY-MM-DD") of an instant in a time zone; by default the
 * zone of whoever runs it, so in the browser it's the viewer's own date.
 */
export function localIsoDate(at: Date = new Date(), timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
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

const longFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Sat, Dec 12", "Nov 25–30", "Nov 28 – Dec 2" or "Dec 30, 2026 – Jan 2, 2027". */
export function formatDateRange(start: string, end?: string | null) {
  if (!end || end === start) return dayFmt.format(toUtcDate(start));
  const a = toUtcDate(start);
  const b = toUtcDate(end);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${longFmt.format(a)} – ${longFmt.format(b)}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${shortFmt.format(a)}–${b.getUTCDate()}`;
  return `${shortFmt.format(a)} – ${shortFmt.format(b)}`;
}

/** Inclusive list of days a plan covers (capped, for the month grid). */
export function daysInRange(start: string, end?: string | null, cap = 62) {
  const days = [start];
  if (!end) return days;
  for (let d = addDays(start, 1); d <= end && days.length < cap; d = addDays(d, 1)) days.push(d);
  return days;
}

// ---- Timed departures (carpools) -------------------------------------------
// Stored as a UTC instant plus the IANA zone it was entered in, and always
// shown in that zone: a 7:30 AM pickup in LA reads 7:30 AM PST for everyone,
// on the server and in the browser alike.

function zonedParts(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Offset of `tz` from UTC at instant `ms`, in ms. */
function zoneOffset(ms: number, tz: string) {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** "2026-12-04T15:30" wall time in `tz` -> ISO UTC instant. */
export function zonedInputToUtc(value: string, tz: string) {
  const [date, time = "00:00"] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Two passes settle the offset around daylight-saving changes.
  let utc = wall - zoneOffset(wall, tz);
  utc = wall - zoneOffset(utc, tz);
  return new Date(utc).toISOString();
}

/** ISO UTC instant -> "2026-12-04T15:30" wall time in `tz` (for datetime-local inputs). */
export function utcToZonedInput(iso: string, tz: string) {
  const p = zonedParts(new Date(iso).getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** "Fri, Dec 4 · 3:30 PM PST" in the departure's own zone. */
export function formatDeparture(iso: string, tz: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
  return `${day} · ${time}`;
}

/** The browser's zone, e.g. "America/Los_Angeles". */
export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
