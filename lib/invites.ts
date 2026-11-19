/** Invite link choices. The database caps expiry at 90 days and uses at 500. */
export const INVITE_DAYS = [1, 7, 30, 90] as const;
/** null = no limit, stored as the database maximum (500). */
export const INVITE_MAX_USES = [null, 1, 5, 25] as const;
export const INVITE_USES_CAP = 500;

export const DEFAULT_INVITE_DAYS = 7;
export const DEFAULT_INVITE_MAX_USES = 25;

export type InviteDays = (typeof INVITE_DAYS)[number];
export type InviteMaxUses = (typeof INVITE_MAX_USES)[number];

/** Snap any stored value to an offered choice (falls back to the default). */
export function inviteDaysChoice(days: number | null | undefined): InviteDays {
  return (INVITE_DAYS as readonly number[]).includes(days ?? -1) ? (days as InviteDays) : DEFAULT_INVITE_DAYS;
}

export function inviteMaxUsesChoice(max: number | null | undefined): InviteMaxUses {
  if (max == null || max >= INVITE_USES_CAP) return null;
  return (INVITE_MAX_USES as readonly (number | null)[]).includes(max) ? (max as InviteMaxUses) : DEFAULT_INVITE_MAX_USES;
}

export function daysLabel(days: number) {
  return days === 1 ? "1 day" : `${days} days`;
}

export function maxUsesLabel(max: InviteMaxUses) {
  return max == null ? "No limit" : max === 1 ? "1 person" : `${max} people`;
}

/** "3 / 5", or "3 joined" for links with no limit. */
export function usesLabel(uses: number, max: number) {
  return max >= INVITE_USES_CAP ? `${uses} joined` : `${uses} / ${max}`;
}
