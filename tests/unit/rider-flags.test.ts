import assert from "node:assert/strict";
import { riderFlagSummary } from "@/lib/types";

test("rider flag summary", () => {
  const r = (can_drive: boolean, large_bag: boolean) => ({ can_drive, large_bag });
  assert.equal(riderFlagSummary([]), "");
  assert.equal(riderFlagSummary([r(false, false)]), "");
  assert.equal(riderFlagSummary([r(true, false), r(true, true)]), "2 riders can also drive · 1 big bag");
  assert.equal(riderFlagSummary([r(true, false)]), "1 rider can also drive");
});
