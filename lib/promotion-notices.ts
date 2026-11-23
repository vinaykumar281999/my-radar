import type { Interest } from "@/lib/types";

/** One row of my_promotion_notices(): the caller's own request, moved off a waitlist. */
export type PromotionNotice = {
  interest_id: string;
  plan_id: string;
  plan_title: string;
  owner_username: string;
  owner_display_name: string;
  promoted_at: string;
};

/**
 * The viewer's own request was moved off the waitlist and they haven't
 * dismissed the notice. Once it's approved or declined there's nothing to say.
 * `seen` comes from promotion_notice_seen (only the requester can read it).
 */
export function isUnseenPromotion(row: Pick<Interest, "status" | "promoted_at">, seen: boolean): boolean {
  return row.status === "pending" && row.promoted_at != null && !seen;
}

/** "You're off the waitlist for Cabin. Alice will confirm your spot." */
export function promotionMessage(n: Pick<PromotionNotice, "plan_title" | "owner_display_name" | "owner_username">) {
  const name = n.owner_display_name.trim() || `@${n.owner_username}`;
  return `You're off the waitlist for ${n.plan_title}. ${name} will confirm your spot.`;
}

export function promotionHref(n: Pick<PromotionNotice, "owner_username" | "plan_id">) {
  return `/${encodeURIComponent(n.owner_username)}/p/${n.plan_id}`;
}

/** On someone's profile, only the notices for that person's plans. */
export function noticesForOwner<T extends Pick<PromotionNotice, "owner_username">>(notices: T[], ownerUsername: string): T[] {
  const owner = ownerUsername.toLowerCase();
  return notices.filter((n) => n.owner_username.toLowerCase() === owner);
}

/**
 * Dismissals are announced on window so every place showing the same notice
 * (a banner, a plan card) drops it at once without reloading.
 */
export const PROMOTION_DISMISSED_EVENT = "radar:promotion-dismissed";
