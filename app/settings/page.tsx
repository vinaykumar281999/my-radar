import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ProfileSettings } from "./ProfileSettings";
import { BlockedList, PausePitches } from "./OwnerControls";
import { CalendarFeed } from "./CalendarFeed";
import { CirclesSettings, MEMBER_SELECT, type Membership, type OwnedCircle } from "./CirclesSettings";
import { Skeleton } from "@/components/ui/skeleton";
import { requireProfile } from "@/lib/data/session";
import type { BlockedContact, Circle, CircleInvite, CircleMember } from "@/lib/types";

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

  const { circles, memberships } = await loadCircles(supabase, profile.id);

  return (
    <div className="mt-6 space-y-6">
      <ProfileSettings profile={profile} />
      <CirclesSettings userId={profile.id} initialCircles={circles} initialMemberships={memberships} />
      <PausePitches userId={profile.id} initialPaused={profile.pitches_paused} />
      <CalendarFeed initialToken={feed?.token ?? null} />
      <BlockedList initialBlocked={blocked ?? []} />
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof requireProfile>>["supabase"];

async function loadCircles(supabase: Supabase, userId: string) {
  const [{ data: owned, error: circlesError }, { data: joined, error: joinedError }] = await Promise.all([
    supabase.from("circles").select("*").eq("owner_id", userId).order("created_at").returns<Circle[]>(),
    supabase
      .from("circle_members")
      .select("circle_id, circles!inner(name, owner:profiles!circles_owner_id_fkey(username, display_name))")
      .eq("user_id", userId)
      .returns<
        { circle_id: string; circles: { name: string; owner: { username: string; display_name: string } | null } }[]
      >(),
  ]);
  if (circlesError) console.error("settings circles", circlesError);
  if (joinedError) console.error("settings memberships", joinedError);

  const ids = (owned ?? []).map((c) => c.id);
  const [{ data: members }, { data: invites }] = ids.length
    ? await Promise.all([
        supabase.from("circle_members").select(MEMBER_SELECT).in("circle_id", ids).order("added_at").returns<CircleMember[]>(),
        supabase.from("circle_invites").select("*").in("circle_id", ids).order("created_at").returns<CircleInvite[]>(),
      ])
    : [{ data: [] as CircleMember[] }, { data: [] as CircleInvite[] }];

  const circles: OwnedCircle[] = (owned ?? []).map((c) => ({
    ...c,
    members: (members ?? []).filter((m) => m.circle_id === c.id),
    invites: (invites ?? []).filter((i) => i.circle_id === c.id),
  }));
  const memberships: Membership[] = (joined ?? []).map((j) => ({
    circle_id: j.circle_id,
    name: j.circles.name,
    owner_username: j.circles.owner?.username ?? "",
    owner_display_name: j.circles.owner?.display_name ?? "",
  }));
  return { circles, memberships };
}

function SettingsSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-busy="true">
      <Skeleton className="h-80 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
