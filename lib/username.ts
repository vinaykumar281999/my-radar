import { RESERVED_USERNAMES, USERNAME_RE } from "@/lib/types";

/** Lowercase, allowed characters only, max 30. */
export function cleanUsername(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

/** Right shape and not a reserved route name. Availability is a separate (database) question. */
export function isValidUsername(name: string) {
  return USERNAME_RE.test(name) && !RESERVED_USERNAMES.has(name);
}

/**
 * Where the landing page's Claim button goes: sign up / sign in, then
 * onboarding with the handle pre-filled. Nothing is reserved on the way; an
 * invalid or empty handle just goes to sign-in without one.
 */
export function claimHref(handle: string) {
  const name = cleanUsername(handle);
  if (!isValidUsername(name)) return "/login";
  return `/login?next=${encodeURIComponent(`/onboarding?handle=${name}`)}`;
}

/**
 * The ?handle= that onboarding received, re-validated there (it came from a
 * URL anyone can edit). Returns null if it isn't usable, so the usual
 * suggestion is used instead.
 */
export function handleFromQuery(raw: string | string[] | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const name = cleanUsername(raw);
  // Reject anything cleanUsername had to change: a mangled handle isn't what they typed.
  return name === raw.toLowerCase() && isValidUsername(name) ? name : null;
}
