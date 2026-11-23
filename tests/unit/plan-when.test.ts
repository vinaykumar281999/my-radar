import assert from "node:assert/strict";
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
  assert.equal(planWhen(plan({ specific_dates: "Nov25-30" }), TODAY).label, "Nov 25–30");
});

test("text that isn't clearly a date is left alone", () => {
  for (const text of ["sometime soon", "weekend after Thanksgiving", "Feb 30", "Nov 30-25", "11/25", ""]) {
    assert.equal(parseLooseDates(text, "2026-11-01"), null, text);
  }
  const w = planWhen(plan({ specific_dates: "weekend after Thanksgiving" }), TODAY);
  assert.equal(w.label, "This Month");
  assert.equal(w.rawDates, "weekend after Thanksgiving");
});

test("timeframes are re-anchored to when the plan was made", () => {
  const madeInOct = "2026-10-15T09:00:00Z";
  assert.equal(planWhen(plan({ timeframe: "Next Month", created_at: madeInOct }), TODAY).label, "This Month", "Oct's next month is now");
  assert.equal(planWhen(plan({ timeframe: "Next Month" }), TODAY).label, "Next Month");
  const stale = planWhen(plan({ timeframe: "This Month", created_at: madeInOct }), TODAY);
  assert.equal(stale.label, "Oct 2026");
  assert.equal(stale.past, true);
  assert.equal(planWhen(plan({ timeframe: "This Weekend", created_at: "2026-11-06T09:00:00Z" }), TODAY).label, "Weekend of Nov 7");
  assert.equal(planWhen(plan({ timeframe: "This Quarter" }), TODAY).label, "This Quarter");
  assert.equal(planWhen(plan({ timeframe: "This Quarter", created_at: "2026-08-01T00:00:00Z" }), TODAY).label, "Q3 2026");
  assert.equal(planWhen(plan({ timeframe: "Later This Year" }), TODAY).label, "Later This Year");
});

test("stored dates win over the timeframe", () => {
  const w = planWhen(plan({ timeframe: "This Month", start_date: "2026-12-04", end_date: "2026-12-06" }), TODAY);
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
  );
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["this-month", "nov-text", "next-month", "dec", "over", "older-over"],
  );
});
