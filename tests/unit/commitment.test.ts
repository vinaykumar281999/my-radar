import assert from "node:assert/strict";
import { INTEREST_STATUSES, commitmentSummary, countLeads, reactionLabel } from "@/lib/types";

test("owner's summary reads naturally", () => {
  assert.equal(commitmentSummary({ interest_count: 0, maybe_count: 0 }), "0");
  assert.equal(commitmentSummary({ interest_count: 3, maybe_count: 0 }), "3 in");
  assert.equal(commitmentSummary({ interest_count: 2, maybe_count: 2 }), "2 maybe");
  assert.equal(commitmentSummary({ interest_count: 5, maybe_count: 2 }), "3 in · 2 maybe");
  assert.equal(commitmentSummary({ interest_count: 1, maybe_count: 4 }), "1 maybe", "never more maybes than reactions");
});

test("counts include maybes; missing commitment counts as in", () => {
  const leads = [
    { status: "interested" as const, commitment: "maybe" as const },
    { status: "interested" as const, commitment: "in" as const },
    { status: "interested" as const },
  ];
  assert.deepEqual(countLeads(leads), { interest_count: 3, maybe_count: 1, approved_count: 0, pending_count: 0 });
});

test("reaction labels: in/maybe for plain interest, status for requests", () => {
  assert.equal(reactionLabel("interested", "in"), "in");
  assert.equal(reactionLabel("interested", "maybe"), "maybe");
  assert.equal(reactionLabel("interested"), "in");
  assert.equal(reactionLabel("waitlisted", "maybe"), "waitlist", "requests never say maybe");
  for (const status of INTEREST_STATUSES) assert.ok(reactionLabel(status).length > 0, status);
});
