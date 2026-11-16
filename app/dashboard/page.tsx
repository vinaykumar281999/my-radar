import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "./DashboardClient";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/data/session";
import type { Pitch, Plan, PlanWithCount } from "@/lib/types";

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

  const [{ data, error }, { data: pitches, error: pitchesError }] = await Promise.all([
    supabase
      .from("plans")
      .select("*, interests(count)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .returns<(Plan & { interests: { count: number }[] })[]>(),
    supabase
      .from("plan_pitches")
      .select("*")
      .eq("target_user_id", profile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<Pitch[]>(),
  ]);

  if (error) console.error("dashboard plans", error);
  if (pitchesError) console.error("dashboard pitches", pitchesError);

  const plans: PlanWithCount[] = (data ?? []).map(({ interests, ...plan }) => ({
    ...plan,
    interest_count: interests?.[0]?.count ?? 0,
  }));

  return <DashboardClient profile={profile} initialPlans={plans} initialPitches={pitches ?? []} />;
}

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
