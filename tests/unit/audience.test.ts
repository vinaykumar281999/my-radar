import assert from "node:assert/strict";
import { canCopyPlan, storyPlans } from "@/lib/audience";

const plan = (visibility: "public" | "unlisted" | "circles", is_archived = false) => ({
  id: visibility,
  user_id: "owner",
  visibility,
  is_archived,
});

test("story export includes only active public plans", () => {
  const plans = [plan("public"), plan("unlisted"), plan("circles"), plan("public", true)];
  assert.deepEqual(storyPlans(plans).map((p) => p.id), ["public"]);
});

test("story export excludes an unknown future audience type", () => {
  const plans = [{ ...plan("public"), visibility: "followers" as never }];
  assert.equal(storyPlans(plans).length, 0);
});

test("copy is offered only on public plans to a signed-in non-owner", () => {
  const ctx = { hostUsername: "alice" };
  assert.equal(canCopyPlan(plan("public"), "viewer", ctx), true);
  assert.equal(canCopyPlan(plan("unlisted"), "viewer", ctx), false);
  assert.equal(canCopyPlan(plan("circles"), "viewer", ctx), false);
  assert.equal(canCopyPlan(plan("public"), null, ctx), false, "signed out");
  assert.equal(canCopyPlan(plan("public"), "owner", ctx), false, "own plan");
  assert.equal(canCopyPlan(plan("public"), "viewer", { ...ctx, demo: true }), false, "demo");
  assert.equal(canCopyPlan({ user_id: "owner" }, "viewer", ctx), false, "visibility unknown");
});

test("copy is never offered on someone else's carpool", () => {
  assert.equal(canCopyPlan({ ...plan("public"), category: "Carpool" }, "viewer", { hostUsername: "alice" }), false);
  assert.equal(canCopyPlan({ ...plan("public"), category: "Trip" }, "viewer", { hostUsername: "alice" }), true);
});
