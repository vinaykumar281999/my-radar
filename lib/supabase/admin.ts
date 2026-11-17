import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, assertSupabaseEnv } from "./env";

/**
 * Service-role client: bypasses RLS. Server-only — never import from client
 * code, and only use it after the caller has been checked (Turnstile, rate limit).
 */
export function createAdminClient() {
  assertSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (Supabase → Project settings → API keys).");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const isAdminConfigured = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
