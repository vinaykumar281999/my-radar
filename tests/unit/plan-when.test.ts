import assert from "node:assert/strict";
import { localIsoDate } from "@/lib/dates";
import { parseLooseDates, planWhen, sortByWhen, type PlanWhenInput } from "@/lib/plan-when";

const TODAY = "2026-11-23"; // a Monday

const plan = (over: Partial<PlanWhenInput> & { id?: string } = {}): PlanWhenInput & { id: string } => ({
  id: "x",
  timeframe: "This Month",
  specific_dates: null,
  start_date: null,
  end_date: null,
  created_at: "2026-11-01T12:00:00Z",
  ...over,
});

test("free-text dates are read and shown as a tidy range", () => {
  assert.deepEqual(parseLooseDates("Nov25-30", "2026-11-01"), { start: "2026-11-25", end: "2026-11-30" });
  assert.deepEqual(parseLooseDates("nov 25 – 30th", "2026-11-01"), { start: "2026-11-25", end: "2026-11-30" });
  assert.deepEqual(parseLooseDates("Nov 28 - Dec 2", "2026-11-01"), { start: "2026-11-28", end: "2026-12-02" });
  assert.deepEqual(parseLooseDates("Dec 12", "2026-11-01"), { start: "2026-12-12", end: "2026-12-12" });
  assert.deepEqual(parseLooseDates("December 30 to Jan 2", "2026-11-01"), { start: "2026-12-30", end: "2027-01-02" });
  assert.deepEqual(parseLooseDates("Jan 5", "2026-11-01"), { start: "2027-01-05", end: "2027-01-05" }, "no year: next January");
  assert.deepEqual(parseLooseDates("Mar 3, 2027", "2026-11-01"), { start: "2027-03-03", end: "2027-03-03" });
  assert.equal(planWhen(plan({ specific_dates: "Nov25-30" }), TODAY, "UTC").label, "Nov 25–30");
});

test("text that isn't clearly a date is left alone", () => {
  for (const text of ["sometime soon", "weekend after Thanksgiving", "Feb 30", "Nov 30-25", "11/25", ""]) {
    assert.equal(parseLooseDates(text, "2026-11-01"), null, text);
  }
  const w = planWhen(plan({ specific_dates: "weekend after Thanksgiving" }), TODAY, "UTC");
  assert.equal(w.label, "This Month");
  assert.equal(w.rawDates, "weekend after Thanksgiving");
});

test("timeframes are re-anchored to when the plan was made", () => {
  const madeInOct = "2026-10-15T09:00:00Z";
  assert.equal(planWhen(plan({ timeframe: "Next Month", created_at: madeInOct }), TODAY, "UTC").label, "This Month", "Oct's next month is now");
  assert.equal(planWhen(plan({ timeframe: "Next Month" }), TODAY, "UTC").label, "Next Month");
  const stale = planWhen(plan({ timeframe: "This Month", created_at: madeInOct }), TODAY, "UTC");
  assert.equal(stale.label, "Oct 2026");
  assert.equal(stale.past, true);
  assert.equal(planWhen(plan({ timeframe: "This Weekend", created_at: "2026-11-06T09:00:00Z" }), TODAY, "UTC").label, "Weekend of Nov 7");
  assert.equal(planWhen(plan({ timeframe: "This Quarter" }), TODAY, "UTC").label, "This Quarter");
  assert.equal(planWhen(plan({ timeframe: "This Quarter", created_at: "2026-08-01T00:00:00Z" }), TODAY, "UTC").label, "Q3 2026");
  assert.equal(planWhen(plan({ timeframe: "Later This Year" }), TODAY, "UTC").label, "Later This Year");
});

test("stored dates win over the timeframe", () => {
  const w = planWhen(plan({ timeframe: "This Month", start_date: "2026-12-04", end_date: "2026-12-06" }), TODAY, "UTC");
  assert.equal(w.label, "Dec 4–6");
  assert.equal(w.past, false);
});

test("the list is soonest first, finished plans last", () => {
  const sorted = sortByWhen(
    [
      plan({ id: "dec", start_date: "2026-12-12" }),
      plan({ id: "next-month", timeframe: "Next Month", created_at: "2026-11-20T00:00:00Z" }),
      plan({ id: "nov-text", specific_dates: "Nov25-30", created_at: "2026-11-20T00:00:00Z" }),
      plan({ id: "over", start_date: "2026-11-02" }),
      plan({ id: "this-month", timeframe: "This Month" }),
      plan({ id: "older-over", timeframe: "This Month", created_at: "2026-09-01T00:00:00Z" }),
    ],
    TODAY,
    "UTC",
  );
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["this-month", "nov-text", "next-month", "dec", "over", "older-over"],
  );
});

test("today is the viewer's local date, not UTC", () => {
  // 11pm on Nov 30 in Denver is already 6am on Dec 1 in UTC.
  const lateNov30 = new Date("2026-12-01T06:00:00Z");
  assert.equal(localIsoDate(lateNov30, "America/Denver"), "2026-11-30");
  assert.equal(localIsoDate(lateNov30, "UTC"), "2026-12-01");

  const today = localIsoDate(lateNov30, "America/Denver");
  const november = plan({ timeframe: "This Month", created_at: "2026-11-10T18:00:00Z" });
  const w = planWhen(november, today, "America/Denver");
  assert.equal(w.label, "This Month");
  assert.equal(w.past, false);
  // The UTC date would wrongly call it over.
  assert.equal(planWhen(november, localIsoDate(lateNov30, "UTC"), "UTC").label, "Nov 2026");
});

test("the day a plan was made is the viewer's local day too", () => {
  // Made at 11pm Nov 30 Denver time: "Next Month" means December, not January.
  const madeLate = plan({ timeframe: "Next Month", created_at: "2026-12-01T06:00:00Z" });
  assert.equal(planWhen(madeLate, "2026-11-30", "America/Denver").label, "Next Month");
  assert.equal(planWhen(madeLate, "2026-12-05", "America/Denver").label, "This Month");
});
