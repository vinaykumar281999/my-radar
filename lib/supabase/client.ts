import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

let client: SupabaseClient | undefined;

/** Browser Supabase client (singleton). Auth session lives in cookies. */
export function createClient() {
  assertSupabaseEnv();
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
