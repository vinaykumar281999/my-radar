import assert from "node:assert/strict";
import { waitlistOrder } from "@/lib/types";
import { submitErrorMessage } from "@/lib/submit-messages";

test("owner's waitlist is in line order: created_at, then id", () => {
  const l = (id: string, status: "waitlisted" | "pending", created_at: string) => ({ id, status, created_at });
  const leads = [
    l("b", "waitlisted", "2026-11-19T10:00:00Z"),
    l("c", "pending", "2026-11-19T09:00:00Z"),
    l("a", "waitlisted", "2026-11-19T10:00:00Z"),
    l("d", "waitlisted", "2026-11-19T08:00:00Z"),
  ];
  assert.deepEqual(waitlistOrder(leads).map((x) => x.id), ["d", "a", "b"]);
});

test("a full plan reads as the waitlist, not an error", () => {
  assert.equal(submitErrorMessage("plan_full", "Alex"), "You're on the waitlist");
});
