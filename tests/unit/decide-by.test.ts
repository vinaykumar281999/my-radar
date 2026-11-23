import assert from "node:assert/strict";
import { decideByInfo, decideByStatic } from "@/lib/decide-by";

const TODAY = "2026-11-23"; // a Monday

test("the server-rendered label doesn't depend on today", () => {
  assert.equal(decideByStatic("2026-11-26"), "Decide by Nov 26");
});

test("days left, with the weekday inside the coming week", () => {
  assert.deepEqual(decideByInfo("2026-11-26", TODAY), { text: "Decide by Thu · 3 days left", tone: "normal" });
  assert.deepEqual(decideByInfo("2026-12-12", TODAY), { text: "Decide by Dec 12 · 19 days left", tone: "normal" });
});

test("amber from 2 days left, grey once passed", () => {
  assert.deepEqual(decideByInfo("2026-11-25", TODAY), { text: "Decide by Wed · 2 days left", tone: "soon" });
  assert.deepEqual(decideByInfo("2026-11-24", TODAY), { text: "Decide by Tue · 1 day left", tone: "soon" });
  assert.deepEqual(decideByInfo("2026-11-23", TODAY), { text: "Decide by Mon · today", tone: "soon" });
  assert.deepEqual(decideByInfo("2026-11-20", TODAY), { text: "Decide by Nov 20 · passed", tone: "past" });
});

test("counts calendar days across a daylight-saving change", () => {
  assert.equal(decideByInfo("2026-11-05", "2026-10-30").text, "Decide by Thu · 6 days left");
});
