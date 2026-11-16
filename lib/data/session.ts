import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Current auth user + profile row (null if not onboarded). Redirects to /login when signed out. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { supabase, user, profile };
});

/** Signed in AND onboarded, otherwise redirect to the right step. */
export async function requireProfile() {
  const ctx = await requireUser();
  if (!ctx.profile) redirect("/onboarding");
  return { ...ctx, profile: ctx.profile };
}
