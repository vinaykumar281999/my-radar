import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Radar as RadarIcon } from "lucide-react";
import { PlanCard } from "@/components/PlanCard";
import { ViewerProvider } from "@/components/ViewerContext";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicPlan, getPublicProfile } from "@/lib/data/public";
import { SharedPlanFallback } from "./SharedPlanFallback";

export async function generateMetadata({ params }: PageProps<"/[username]/p/[planId]">): Promise<Metadata> {
  const { username, planId } = await params;
  const found = await getPublicPlan(username, planId);
  // Circle plans never reach this (anonymous) read, so their titles can't leak into link previews.
  if (!found) return { title: "Plan not available", robots: { index: false, follow: false } };

  const { profile, plan } = found;
  const description = plan.notes ?? `${profile.display_name} is planning this. Tap “I'm Interested” to get in.`;
  return {
    title: `${plan.title} · ${profile.display_name}`,
    description,
    openGraph: { title: plan.title, description },
    // Direct links (including unlisted plans) shouldn't end up in search results.
    robots: { index: false, follow: false },
  };
}

export default function PlanPage({ params }: PageProps<"/[username]/p/[planId]">) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pt-8 pb-10">
      <Suspense fallback={<PlanSkeleton />}>
        <PlanContent params={params} />
      </Suspense>
      <footer className="mt-auto pt-10 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RadarIcon className="size-3.5 text-primary" />
          Make your own Radar
        </Link>
      </footer>
    </main>
  );
}

async function PlanContent({ params }: { params: PageProps<"/[username]/p/[planId]">["params"] }) {
  const { username, planId } = await params;
  const found = await getPublicPlan(username, planId);

  if (!found) {
    const profile = await getPublicProfile(username);
    if (!profile) notFound();
    // Missing, archived, or a circle plan: identical server output either way.
    return (
      <ViewerProvider>
        <ProfileLink username={profile.username} displayName={profile.display_name} avatarUrl={profile.avatar_url} />
        <SharedPlanFallback
          planId={planId}
          ownerId={profile.id}
          hostName={profile.display_name}
          hostUsername={profile.username}
        />
      </ViewerProvider>
    );
  }

  const { profile, plan } = found;

  return (
    <ViewerProvider>
      <ProfileLink username={profile.username} displayName={profile.display_name} avatarUrl={profile.avatar_url} />
      <PlanCard plan={plan} hostName={profile.display_name} hostUsername={profile.username} className="mt-5" />
      <Link
        href={`/${profile.username}`}
        className="mt-4 inline-flex items-center gap-1 self-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        See {profile.display_name.split(" ")[0]}&apos;s other plans <ArrowRight className="size-3.5" />
      </Link>
    </ViewerProvider>
  );
}

function ProfileLink({
  username,
  displayName,
  avatarUrl,
}: {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  return (
    <Link href={`/${username}`} className="flex items-center gap-3">
      <Avatar name={displayName} src={avatarUrl} className="size-10 text-sm" />
      <span className="min-w-0">
        <span className="block truncate font-bold">{displayName}</span>
        <span className="block text-sm text-muted-foreground">@{username}</span>
      </span>
    </Link>
  );
}

function PlanSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="mt-5 h-48 w-full rounded-2xl" />
    </div>
  );
}
