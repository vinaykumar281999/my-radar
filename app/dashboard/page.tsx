import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "./DashboardClient";
import type { ViewAsMember } from "@/components/ViewAsDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/data/session";
import type { Circle, CircleOption, CircleSettings, JoinNotice, Pitch, Plan, PlanWithCount } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const { supabase, profile } = await requireProfile();

  const [
    { data, error },
    { data: pitches, error: pitchesError },
    { data: notices, error: noticesError },
    { data: circles, error: circlesError },
    { data: audiences, error: audiencesError },
    { data: members, error: membersError },
    { data: circleSettings, error: settingsError },
  ] = await Promise.all([
    supabase
      .from("plans")
      // Filtered count embeds: all interests, "maybe"s, approved spots, requests awaiting a decision.
      .select("*, interests(count), maybe:interests(count), approved:interests(count), pending:interests(count)")
      .eq("user_id", profile.id)
      .eq("maybe.commitment", "maybe")
      .eq("approved.status", "approved")
      .eq("pending.status", "pending")
      .order("created_at", { ascending: false })
      .returns<(Plan & { interests: Count; maybe: Count; approved: Count; pending: Count })[]>(),
    supabase
      .from("plan_pitches")
      .select("*")
      .eq("target_user_id", profile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<Pitch[]>(),
    // People who joined one of my circles through an invite link, not yet dismissed.
    supabase
      .from("circle_members")
      .select(
        "circle_id, user_id, added_at, circles!inner(name, owner_id), profiles!circle_members_user_id_fkey(username, display_name)",
      )
      .eq("circles.owner_id", profile.id)
      .not("invite_id", "is", null)
      .is("seen_at", null)
      .order("added_at", { ascending: false })
      .returns<JoinNotice[]>(),
    supabase.from("circles").select("id, name").eq("owner_id", profile.id).order("name").returns<Pick<Circle, "id" | "name">[]>(),
    supabase.from("plan_audiences").select("plan_id, circle_id").eq("owner_id", profile.id).returns<{ plan_id: string; circle_id: string }[]>(),
    // Members of my circles, for "View as".
    supabase
      .from("circle_members")
      .select("circle_id, user_id, circles!inner(owner_id), profiles!circle_members_user_id_fkey(username, display_name)")
      .eq("circles.owner_id", profile.id)
      .returns<CircleMemberRow[]>(),
    // Owner-only per-circle defaults for the plan form (RLS).
    supabase
      .from("circle_settings")
      .select("circle_id, preselect_for_new_plans, default_capacity")
      .eq("owner_id", profile.id)
      .returns<Pick<CircleSettings, "circle_id" | "preselect_for_new_plans" | "default_capacity">[]>(),
  ]);

  if (error) console.error("dashboard plans", error);
  if (pitchesError) console.error("dashboard pitches", pitchesError);
  if (noticesError) console.error("dashboard join notices", noticesError);
  if (circlesError) console.error("dashboard circles", circlesError);
  if (audiencesError) console.error("dashboard audiences", audiencesError);
  if (membersError) console.error("dashboard members", membersError);
  if (settingsError) console.error("dashboard circle settings", settingsError);

  const circleOptions: CircleOption[] = (circles ?? []).map((c) => {
    const s = (circleSettings ?? []).find((x) => x.circle_id === c.id);
    return { ...c, preselect_for_new_plans: s?.preselect_for_new_plans ?? false, default_capacity: s?.default_capacity ?? null };
  });

  // One entry per person, with every circle of mine they're in.
  const viewAs = new Map<string, ViewAsMember>();
  for (const m of members ?? []) {
    const entry = viewAs.get(m.user_id) ?? {
      id: m.user_id,
      username: m.profiles?.username ?? "unknown",
      display_name: m.profiles?.display_name ?? "",
      circleIds: [],
    };
    entry.circleIds.push(m.circle_id);
    viewAs.set(m.user_id, entry);
  }

  const audienceByPlan: Record<string, string[]> = {};
  for (const a of audiences ?? []) (audienceByPlan[a.plan_id] ??= []).push(a.circle_id);

  const plans: PlanWithCount[] = (data ?? []).map(({ interests, maybe, approved, pending, ...plan }) => ({
    ...plan,
    interest_count: interests?.[0]?.count ?? 0,
    maybe_count: maybe?.[0]?.count ?? 0,
    approved_count: approved?.[0]?.count ?? 0,
    pending_count: pending?.[0]?.count ?? 0,
  }));

  return (
    <DashboardClient
      profile={profile}
      initialPlans={plans}
      initialPitches={pitches ?? []}
      initialJoinNotices={notices ?? []}
      circles={circleOptions}
      initialAudiences={audienceByPlan}
      viewAsMembers={[...viewAs.values()].sort((a, b) => a.username.localeCompare(b.username))}
    />
  );
}

type Count = { count: number }[];

type CircleMemberRow = {
  circle_id: string;
  user_id: string;
  profiles: { username: string; display_name: string } | null;
};

function DashboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
      <Skeleton className="mt-6 h-12 w-full rounded-xl" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </main>
  );
}
