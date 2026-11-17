import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ProfileSettings } from "./ProfileSettings";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/data/session";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-4 pb-16">
      <header className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
      </header>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsData />
      </Suspense>
    </main>
  );
}

async function SettingsData() {
  const { profile } = await requireProfile();
  return (
    <div className="mt-6 space-y-6">
      <ProfileSettings profile={profile} />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-busy="true">
      <Skeleton className="h-80 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
