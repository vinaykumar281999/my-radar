import assert from "node:assert/strict";
import { INTEREST_STATUSES } from "@/lib/types";
import {
  isUnseenPromotion,
  noticesForOwner,
  promotionHref,
  promotionMessage,
  type PromotionNotice,
} from "@/lib/promotion-notices";

const notice = (over: Partial<PromotionNotice> = {}): PromotionNotice => ({
  interest_id: "i1",
  plan_id: "p1",
  plan_title: "Cabin weekend",
  owner_username: "alice",
  owner_display_name: "Alice Chen",
  promoted_at: "2026-11-23T10:00:00Z",
  ...over,
});

test("only a still-pending, promoted, undismissed request counts as unseen", () => {
  const promoted = "2026-11-23T10:00:00Z";
  assert.equal(isUnseenPromotion({ status: "pending", promoted_at: promoted }, false), true);
  assert.equal(isUnseenPromotion({ status: "pending", promoted_at: promoted }, true), false, "dismissed");
  assert.equal(isUnseenPromotion({ status: "pending", promoted_at: null }, false), false, "never on the waitlist");
  for (const status of INTEREST_STATUSES.filter((s) => s !== "pending")) {
    assert.equal(isUnseenPromotion({ status, promoted_at: promoted }, false), false, status);
  }
});

test("the banner names the plan and the owner", () => {
  assert.equal(promotionMessage(notice()), "You're off the waitlist for Cabin weekend. Alice Chen will confirm your spot.");
  assert.equal(
    promotionMessage(notice({ owner_display_name: "  " })),
    "You're off the waitlist for Cabin weekend. @alice will confirm your spot.",
    "no display name: falls back to the handle",
  );
});

test("the banner links to the plan page", () => {
  assert.equal(promotionHref(notice()), "/alice/p/p1");
});

test("a profile shows only notices for that person's plans", () => {
  const list = [notice({ interest_id: "a", owner_username: "alice" }), notice({ interest_id: "b", owner_username: "bob" })];
  assert.deepEqual(noticesForOwner(list, "Alice").map((n) => n.interest_id), ["a"]);
  assert.deepEqual(noticesForOwner(list, "carol"), []);
});
