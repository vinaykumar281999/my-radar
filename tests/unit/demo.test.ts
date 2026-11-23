import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addDays } from "@/lib/dates";
import { effectiveTimeframe } from "@/lib/types";
import { demoPlans, demoTabs } from "@/lib/demo";

test("demo dates come from today, for every day of the year", () => {
  for (let i = 0; i < 366; i++) {
    const today = addDays("2026-01-01", i);
    const [hike, concert, trip] = demoPlans(today);
    for (const p of [hike, concert, trip]) {
      assert.ok(p.start_date >= today, `${today}: ${p.id} is never in the past`);
      // The tab a card sits under is what a real profile would compute for that date.
      assert.equal(p.timeframe, effectiveTimeframe({ timeframe: "This Month", created_at: today, start_date: p.start_date }, today));
    }
    assert.equal(hike.timeframe, "This Weekend", `${today}: the hike is always this weekend`);
    assert.equal(trip.timeframe, "Next Month", `${today}: the trip is always next month`);
    assert.ok(hike.start_date < concert.start_date && concert.start_date < trip.start_date, `${today}: cards are in date order`);
  }
});

test("printed dates match the computed ones", () => {
  const [hike, concert, trip] = demoPlans("2026-11-23"); // a Monday
  assert.equal(hike.when, "Sat, Nov 28 · 5:30 AM");
  assert.equal(concert.when, "Fri, Dec 4");
  assert.equal(trip.when, "Dec 12–15");
  assert.deepEqual(demoTabs(demoPlans("2026-11-23")), ["All", "This Weekend", "Next Month"]);
  assert.deepEqual(demoTabs(demoPlans("2026-11-02")), ["All", "This Weekend", "This Month", "Next Month"]);
});

test("the demo never touches the database", () => {
  // Everything the landing mockup and /demo render must be free of Supabase and server actions.
  const files = ["lib/demo.ts", ...readdirSync("components/demo").map((f) => join("components/demo", f)), "app/demo/page.tsx"];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue; // not created yet
    }
    assert.ok(!/supabase|@\/lib\/actions|InterestModal|from "@\/components\/PlanCard"/.test(src), `${file} must not import data access`);
  }
});
