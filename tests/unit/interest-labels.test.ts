import assert from "node:assert/strict";
import { INTEREST_STATUSES, INTEREST_STATUS_LABEL } from "@/lib/types";

test("every interest status has a label, waitlisted included", () => {
  for (const status of INTEREST_STATUSES) {
    assert.ok(INTEREST_STATUS_LABEL[status]?.trim(), `missing label for ${status}`);
  }
  assert.deepEqual(Object.keys(INTEREST_STATUS_LABEL).sort(), [...INTEREST_STATUSES].sort(), "no labels for unknown statuses");
  assert.equal(INTEREST_STATUS_LABEL.waitlisted, "waitlist");
});
