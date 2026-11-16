import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Radar as RadarIcon } from "lucide-react";
import { OnboardingForm } from "./OnboardingForm";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/data/session";

export const metadata: Metadata = { title: "Claim your username" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-12">
      <div className="mb-6 flex items-center gap-2 self-center text-lg font-bold tracking-tight">
        <RadarIcon className="size-5 text-primary" /> Radar
      </div>
      <div className="tap-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">Claim your link</h1>
        <p className="mt-1 text-sm text-muted-foreground">This is what goes in your Instagram bio.</p>
        <Suspense fallback={<Skeleton className="mt-6 h-72 w-full" />}>
          <OnboardingGate />
        </Suspense>
      </div>
    </main>
  );
}

async function OnboardingGate() {
  const { user, profile } = await requireUser();
  if (profile) redirect("/dashboard");

  const emailLocal = (user.email ?? "").split("@")[0] ?? "";
  const suggested = emailLocal.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);

  return <OnboardingForm userId={user.id} suggestedUsername={suggested} />;
}
