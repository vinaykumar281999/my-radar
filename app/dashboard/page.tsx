import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "./DashboardClient";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/data/session";
import type { Plan, PlanWithCount } from "@/lib/types";

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

  const { data, error } = await supabase
    .from("plans")
    .select("*, interests(count)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .returns<(Plan & { interests: { count: number }[] })[]>();

  if (error) console.error("dashboard plans", error);

  const plans: PlanWithCount[] = (data ?? []).map(({ interests, ...plan }) => ({
    ...plan,
    interest_count: interests?.[0]?.count ?? 0,
  }));

  return <DashboardClient profile={profile} initialPlans={plans} />;
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
