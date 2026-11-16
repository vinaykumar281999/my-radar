import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { USERNAME_RE, sortPlans, type Plan, type Profile } from "@/lib/types";

export type PublicRadar = { profile: Profile; plans: Plan[] };

/** Profile + active plans for a public bio page. Deduped per request. */
export const getPublicRadar = cache(async (rawUsername: string): Promise<PublicRadar | null> => {
  const username = decodeURIComponent(rawUsername).toLowerCase();
  if (!USERNAME_RE.test(username) || !isSupabaseConfigured) return null;

  const supabase = createPublicClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle<Profile>();

  if (error) logError("getPublicRadar profile", error);
  if (!profile) return null;

  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", profile.id)
    .eq("is_archived", false)
    .returns<Plan[]>();

  if (plansError) logError("getPublicRadar plans", plansError);

  return { profile, plans: sortPlans(plans ?? []) };
});

/** Skip Next's expected "fetch aborted after prerender" noise; log real failures. */
function logError(label: string, error: { message?: string }) {
  if (error.message?.includes("During prerendering")) return;
  console.error(label, error);
}
