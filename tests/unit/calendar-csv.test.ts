import assert from "node:assert/strict";
import { effectiveTimeframe, sortPlans, type Timeframe } from "@/lib/types";
import { addDays, daysInRange, formatDateRange } from "@/lib/dates";
import { buildCalendar, googleCalendarUrl } from "@/lib/ics";
import { toCsv } from "@/lib/csv";

test("dates, buckets, sorting, .ics and CSV", () => {
  const p = (start_date: string | null, timeframe: Timeframe = "Later This Year", created_at = "2026-01-01") =>
    ({ start_date, timeframe, created_at });

  // Today = Tue 2026-11-17
  const T = "2026-11-17";
  assert.equal(effectiveTimeframe(p("2026-11-21"), T), "This Weekend");   // Sat
  assert.equal(effectiveTimeframe(p("2026-11-22"), T), "This Weekend");   // Sun
  assert.equal(effectiveTimeframe(p("2026-11-19"), T), "This Month");     // Thu, not weekend
  assert.equal(effectiveTimeframe(p("2026-11-28"), T), "This Month");     // next Sat
  assert.equal(effectiveTimeframe(p("2026-12-05"), T), "Next Month");
  assert.equal(effectiveTimeframe(p("2027-01-10"), T), "Later This Year"); // other quarter/year
  assert.equal(effectiveTimeframe(p("2026-01-10", "This Month"), T), "This Month"); // past: keep stored
  assert.equal(effectiveTimeframe(p(null, "This Quarter"), T), "This Quarter");
  // Today Sunday: weekend = today only
  assert.equal(effectiveTimeframe(p("2026-11-22"), "2026-11-22"), "This Weekend");
  assert.equal(effectiveTimeframe(p("2026-11-27"), "2026-11-22"), "This Month");
  // Quarter: today Oct 5 -> Dec 10 same quarter
  assert.equal(effectiveTimeframe(p("2026-12-10"), "2026-10-05"), "This Quarter");

  const sorted = sortPlans([
    p(null, "This Month", "2026-11-10"),
    p("2026-11-30", "This Month"),
    p("2026-11-20", "This Month"),   // Fri -> This Weekend
    p(null, "This Month", "2026-11-12"),
  ], T);
  assert.deepEqual(sorted.map((x) => x.start_date ?? x.created_at), ["2026-11-20", "2026-11-30", "2026-11-12", "2026-11-10"]);

  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(daysInRange("2026-11-29", "2026-12-01"), ["2026-11-29", "2026-11-30", "2026-12-01"]);
  assert.equal(formatDateRange("2026-11-21"), "Sat, Nov 21");
  assert.equal(formatDateRange("2026-11-21", "2026-11-23"), "Nov 21 – Nov 23");

  const ics = buildCalendar([{ uid: "a@radar", title: "Ski, trip; 🎿 " + "x".repeat(100), start: "2026-12-30", end: "2027-01-02", description: "line1\nline2", url: "https://r.app/a/p/1" }], "Vinay's Radar");
  assert.match(ics, /DTSTART;VALUE=DATE:20261230\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20270103\r\n/);         // exclusive
  assert.match(ics, /SUMMARY:Ski\\, trip\; 🎿/);
  assert.ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "folded to 75 octets");
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  const g = new URL(googleCalendarUrl({ title: "Hike", start: "2026-11-21", end: null }));
  assert.equal(g.searchParams.get("dates"), "20261121/20261122");

  const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "@alex.r"], ["+1 555 123 4567", "-2+3"], ["has,comma", "quote\"d"]]);
  assert.equal(csv, 'a,b\r\n"\'=HYPERLINK(""x"")",@alex.r\r\n+1 555 123 4567,\'-2+3\r\n"has,comma","quote""d"');
});
