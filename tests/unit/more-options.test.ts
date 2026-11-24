import assert from "node:assert/strict";
import { moreOptionsAutoOpen, moreOptionsSummary, withCategory } from "@/lib/plan-form";
import type { PlanInput } from "@/lib/types";

const base: PlanInput = {
  title: "Zion",
  category: "Trip",
  timeframe: "Next Month",
  status: "Just an Idea",
  specific_dates: "",
  start_date: "",
  end_date: "",
  dates_flexible: false,
  decide_by: "",
  notes: "",
  visibility: "public",
  capacity: null,
  origin: "",
  destination: "",
  departs_at: null,
  departs_tz: null,
  round_trip: false,
  returns_at: null,
  gas_split: null,
  gas_currency: null,
  stops: null,
};

test("a new, plain plan starts with More options closed", () => {
  assert.equal(moreOptionsAutoOpen(base, { editing: false }), false);
  // A new plan's own choices don't force it open (only carpool and decide-by do).
  assert.equal(moreOptionsAutoOpen({ ...base, capacity: 4, start_date: "2026-12-11" }, { editing: false }), false);
});

test("editing opens it when the plan already uses anything in it", () => {
  assert.equal(moreOptionsAutoOpen(base, { editing: true }), false, "nothing used: stays closed");
  for (const [label, change] of [
    ["unlisted", { visibility: "unlisted" }],
    ["circles", { visibility: "circles" }],
    ["dates", { start_date: "2026-12-11" }],
    ["flexible", { dates_flexible: true }],
    ["spots", { capacity: 4 }],
    ["old text dates", { specific_dates: "Nov25-30" }],
  ] as const) {
    assert.equal(moreOptionsAutoOpen({ ...base, ...change }, { editing: true }), true, label);
  }
});

test("Carpool always opens it (its fields are required)", () => {
  // Through the real category rule, which also makes a new carpool circles-only.
  const carpool = withCategory(base, "Carpool", true);
  assert.equal(carpool.visibility, "circles", "the carpool safety default is unchanged");
  assert.equal(moreOptionsAutoOpen(carpool, { editing: false }), true);
  assert.equal(moreOptionsAutoOpen(withCategory(base, "Carpool", false), { editing: true }), true);
});

test("Booking Soon with a decide-by date opens it; without one it doesn't", () => {
  assert.equal(moreOptionsAutoOpen({ ...base, status: "Booking Soon", decide_by: "2026-12-01" }, { editing: false }), true);
  assert.equal(moreOptionsAutoOpen({ ...base, status: "Booking Soon" }, { editing: false }), false);
  assert.equal(moreOptionsAutoOpen({ ...base, status: "Just an Idea", decide_by: "2026-12-01" }, { editing: false }), false, "decide-by only counts on Booking Soon");
});

test("the collapsed row sums it up in one line", () => {
  assert.equal(moreOptionsSummary(base), "Public · no dates");
  assert.equal(
    moreOptionsSummary({ ...base, visibility: "circles", start_date: "2026-12-11", end_date: "2026-12-14", capacity: 4 }, { circleNames: ["College"] }),
    "Circles: College · Dec 11–14 · 4 spots",
  );
  assert.equal(moreOptionsSummary({ ...base, visibility: "unlisted", dates_flexible: true }), "Unlisted · no dates · flexible");
  assert.equal(moreOptionsSummary({ ...base, status: "Booking Soon", decide_by: "2026-12-01" }), "Public · no dates · decide by Dec 1");
  const ride = { ...withCategory(base, "Carpool", true), origin: "SF", destination: "Tahoe", capacity: 3 };
  assert.equal(moreOptionsSummary(ride), "Circles · SF → Tahoe · 3 seats");
  assert.equal(moreOptionsSummary(withCategory(base, "Carpool", true)), "Circles · route needed");
});
