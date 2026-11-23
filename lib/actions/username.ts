"use server";

import { clientIp, hashIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  USERNAME_CHECK_LIMIT,
  USERNAME_CHECK_WINDOW_SECONDS,
  decideUsernameCheck,
  type UsernameCheck,
} from "@/lib/username-check";

/**
 * Is this username free? Used by the landing page, onboarding and settings.
 * username_available() isn't callable by anon any more, so signed-out checks
 * come through here and are rate-limited per IP with the same limiter as the
 * interest/pitch forms. Signed-in checks run as the user.
 */
export async function checkUsernameAvailable(username: unknown): Promise<UsernameCheck> {
  const name = typeof username === "string" ? username.toLowerCase() : "";
  try {
    const userClient = await createClient();
    // Only to choose how to look it up; the database still verifies the token.
    const {
      data: { session },
    } = await userClient.auth.getSession();

    return await decideUsernameCheck(name, {
      signedIn: !!session,
      consume: async () => {
        const ip = await clientIp();
        const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
          p_bucket: `username:${hashIp(ip ?? "unknown")}`,
          p_limit: USERNAME_CHECK_LIMIT,
          p_window_seconds: USERNAME_CHECK_WINDOW_SECONDS,
        });
        if (error) console.error("consume_rate_limit (username)", error);
        return error ? null : data === true;
      },
      lookup: async (asUser) => {
        const db = asUser ? userClient : createAdminClient();
        const { data, error } = await db.rpc("username_available", { p_username: name });
        if (error) console.error("username_available", error);
        return error ? null : data === true;
      },
    });
  } catch (err) {
    console.error("checkUsernameAvailable", err);
    return "error";
  }
}
