import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { USERNAME_RE, sortPlans, type Plan, type Profile, type Spots } from "@/lib/types";

export type PublicRadar = { profile: Profile; plans: Plan[]; spots: Record<string, Spots> };

/** Profile by username (case-insensitive). Deduped per request. */
export const getPublicProfile = cache(async (rawUsername: string): Promise<Profile | null> => {
  const username = decodeURIComponent(rawUsername).toLowerCase();
  if (!USERNAME_RE.test(username) || !isSupabaseConfigured) return null;

  const { data: profile, error } = await createPublicClient()
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle<Profile>();

  if (error) logError("getPublicProfile", error);
  return profile ?? null;
});

/** Profile + active public plans for a public bio page. Deduped per request. */
export const getPublicRadar = cache(async (rawUsername: string): Promise<PublicRadar | null> => {
  const profile = await getPublicProfile(rawUsername);
  if (!profile) return null;

  const supabase = createPublicClient();
  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", profile.id)
    .eq("is_archived", false)
    .eq("visibility", "public")
    .returns<Plan[]>();

  if (plansError) logError("getPublicRadar plans", plansError);

  return { profile, plans: sortPlans(plans ?? []), spots: await getSpots(plans ?? []) };
});

/** Profile + one active plan (public or unlisted) for a direct plan link. */
export const getPublicPlan = cache(
  async (rawUsername: string, planId: string): Promise<{ profile: Profile; plan: Plan; spots: Record<string, Spots> } | null> => {
    if (!UUID_RE.test(planId)) return null;
    const radar = await getPublicProfile(rawUsername);
    if (!radar) return null;

    const { data: plan, error } = await createPublicClient()
      .rpc("get_public_plan", { p_plan_id: planId })
      .maybeSingle<Plan>();
    if (error) logError("getPublicPlan", error);
    // The plan must belong to the user in the URL.
    if (!plan || plan.user_id !== radar.id) return null;
    return { profile: radar, plan, spots: await getSpots([plan]) };
  },
);

/** Anonymous spot counts, so these can only ever cover public/unlisted plans. */
async function getSpots(plans: Pick<Plan, "id" | "capacity">[]): Promise<Record<string, Spots>> {
  const ids = plans.filter((p) => p.capacity != null).map((p) => p.id);
  if (ids.length === 0) return {};
  const { data, error } = await createPublicClient().rpc("plan_spots", { p_plan_ids: ids });
  if (error) logError("plan_spots", error);
  return Object.fromEntries(
    ((data as { plan_id: string; capacity: number; taken: number }[] | null) ?? []).map((s) => [
      s.plan_id,
      { capacity: s.capacity, taken: s.taken },
    ]),
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Skip Next's expected "fetch aborted after prerender" noise; log real failures. */
function logError(label: string, error: { message?: string }) {
  if (error.message?.includes("During prerendering")) return;
  console.error(label, error);
}
