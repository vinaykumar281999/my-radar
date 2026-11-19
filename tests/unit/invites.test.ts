import assert from "node:assert/strict";
import { INVITE_DAYS, inviteDaysChoice, inviteMaxUsesChoice, usesLabel } from "@/lib/invites";

test("invite choices stay within the database caps", () => {
  assert.ok(INVITE_DAYS.every((d) => d >= 1 && d <= 90));
  assert.equal(inviteDaysChoice(365), 7, "unknown expiry falls back to the default");
  assert.equal(inviteMaxUsesChoice(500), null, "the 500 cap reads as no limit");
  assert.equal(usesLabel(3, 5), "3 / 5");
  assert.equal(usesLabel(3, 500), "3 joined");
});
