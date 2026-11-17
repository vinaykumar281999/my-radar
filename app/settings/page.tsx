import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ProfileSettings } from "./ProfileSettings";
import { BlockedList, PausePitches } from "./OwnerControls";
import { CalendarFeed } from "./CalendarFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/data/session";
import type { BlockedContact } from "@/lib/types";

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
  const { supabase, profile } = await requireProfile();
  const [{ data: blocked, error }, { data: feed }] = await Promise.all([
    supabase
      .from("blocked_contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<BlockedContact[]>(),
    supabase.from("calendar_feeds").select("token").maybeSingle<{ token: string }>(),
  ]);
  if (error) console.error("settings blocked_contacts", error);

  return (
    <div className="mt-6 space-y-6">
      <ProfileSettings profile={profile} />
      <PausePitches userId={profile.id} initialPaused={profile.pitches_paused} />
      <CalendarFeed initialToken={feed?.token ?? null} />
      <BlockedList initialBlocked={blocked ?? []} />
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
