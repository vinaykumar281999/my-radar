import { isValidUsername } from "@/lib/username";

export type UsernameCheck = "available" | "taken" | "invalid" | "rate_limited" | "error";

/** Signed-out availability checks per IP: generous for typing, useless for scraping. */
export const USERNAME_CHECK_LIMIT = 60;
export const USERNAME_CHECK_WINDOW_SECONDS = 60;

/**
 * The decision behind the checkUsernameAvailable server action, with the I/O
 * passed in so it can be tested on its own:
 * - malformed or reserved names are answered without touching the database;
 * - signed-out callers spend one rate-limit hit per lookup (signed-in callers
 *   can already call username_available themselves, so limiting them here
 *   would add friction without stopping anything);
 * - the lookup runs as the user when signed in, so their own current and old
 *   names count as theirs.
 * consume / lookup return null when something went wrong.
 */
export async function decideUsernameCheck(
  username: string,
  io: {
    signedIn: boolean;
    consume: () => Promise<boolean | null>;
    lookup: (asUser: boolean) => Promise<boolean | null>;
  },
): Promise<UsernameCheck> {
  if (!isValidUsername(username)) return "invalid";
  if (!io.signedIn) {
    const allowed = await io.consume();
    if (allowed === null) return "error";
    if (!allowed) return "rate_limited";
  }
  const available = await io.lookup(io.signedIn);
  if (available === null) return "error";
  return available ? "available" : "taken";
}
