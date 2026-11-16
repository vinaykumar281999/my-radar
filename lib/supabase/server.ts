import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

/** Request-scoped client that acts as the signed-in user (reads auth cookies). */
export async function createClient() {
  // Read cookies first so the route is marked dynamic before any env check runs.
  const cookieStore = await cookies();
  assertSupabaseEnv();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** Cookieless anon client for public reads (public bio page, OG image). */
export function createPublicClient() {
  assertSupabaseEnv();
  return createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
