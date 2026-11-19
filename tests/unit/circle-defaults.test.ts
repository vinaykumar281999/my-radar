import assert from "node:assert/strict";
import { circleDefaultCapacity, preselectedCircleIds } from "@/lib/plan-form";
import { inviteDefaults, storedMaxUses } from "@/lib/invites";

const circles = [
  { id: "college", name: "College", preselect_for_new_plans: true, default_capacity: 6 },
  { id: "work", name: "Work", preselect_for_new_plans: false, default_capacity: null },
  { id: "ski", name: "Ski", preselect_for_new_plans: true, default_capacity: 4 },
];

test("preselected circles", () => {
  assert.deepEqual(preselectedCircleIds(circles), ["college", "ski"]);
  assert.deepEqual(preselectedCircleIds([{ id: "x", name: "X" }]), [], "no settings saved: nothing preselected");
});

test("a circle's default spots apply only when it's the one circle picked", () => {
  assert.equal(circleDefaultCapacity(["college"], circles), 6);
  assert.equal(circleDefaultCapacity(["work"], circles), null);
  assert.equal(circleDefaultCapacity(["college", "ski"], circles), null);
  assert.equal(circleDefaultCapacity([], circles), null);
});

test("invite picker starts from a circle's saved defaults", () => {
  assert.deepEqual(inviteDefaults(null), { days: 7, maxUses: 25 }, "nothing saved");
  assert.deepEqual(inviteDefaults({ default_invite_days: 30, default_invite_max_uses: null }), { days: 30, maxUses: 25 }, "null uses = app default");
  assert.deepEqual(inviteDefaults({ default_invite_days: 1, default_invite_max_uses: 500 }), { days: 1, maxUses: null }, "500 = no limit");
  assert.deepEqual(inviteDefaults({ default_invite_days: 45, default_invite_max_uses: 5 }), { days: 7, maxUses: 5 }, "unknown days snap to default");
  assert.equal(storedMaxUses(null), 500);
  assert.equal(storedMaxUses(5), 5);
});
