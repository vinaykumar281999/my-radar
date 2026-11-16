import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Radar as RadarIcon } from "lucide-react";
import { PlanCard } from "@/components/PlanCard";
import { PitchPrompt } from "@/components/PitchModal";
import { ViewerProvider } from "@/components/ViewerContext";
import { ShareButton } from "@/components/ShareButton";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicRadar } from "@/lib/data/public";
import { groupByTimeframe } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  const radar = await getPublicRadar(username);
  if (!radar) return { title: "Radar not found" };

  const { profile, plans } = radar;
  const title = `${profile.display_name} (@${profile.username})`;
  const description =
    plans.length > 0
      ? `Upcoming: ${plans.slice(0, 3).map((p) => p.title).join(" · ")}. Tap “I'm Interested” to get in.`
      : profile.bio ?? `See what ${profile.display_name} is planning next.`;

  return {
    title,
    description,
    openGraph: { title: `${profile.display_name}'s Radar`, description, type: "profile" },
    twitter: { card: "summary_large_image", title: `${profile.display_name}'s Radar`, description },
  };
}

export default function PublicRadarPage({ params }: PageProps<"/[username]">) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pt-8 pb-10">
      <Suspense fallback={<RadarSkeleton />}>
        <RadarContent params={params} />
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

async function RadarContent({ params }: { params: PageProps<"/[username]">["params"] }) {
  const { username } = await params;
  const radar = await getPublicRadar(username);
  if (!radar) notFound();

  const { profile, plans } = radar;
  const groups = groupByTimeframe(plans);

  return (
    <ViewerProvider>
      <header className="flex flex-col items-center text-center">
        <Avatar name={profile.display_name} src={profile.avatar_url} className="size-20 text-2xl" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{profile.display_name}</h1>
        <p className="text-sm font-medium text-muted-foreground">@{profile.username}</p>
        {profile.bio && <p className="mt-2 max-w-xs text-[15px] text-balance text-foreground/80">{profile.bio}</p>}
        <ShareButton path={`/${profile.username}`} title={`${profile.display_name}'s Radar`} className="mt-4" />
      </header>

      {groups.length === 0 ? (
        <div className="tap-card mt-8 px-6 py-10 text-center">
          <p className="text-3xl">🛰️</p>
          <p className="mt-3 font-semibold">Nothing on the radar yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.display_name.split(" ")[0]} hasn&apos;t posted any plans. Check back soon!
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.timeframe} aria-labelledby={`tf-${group.timeframe}`}>
              <h2
                id={`tf-${group.timeframe}`}
                className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                {group.timeframe}
                <span className="h-px flex-1 bg-border" />
              </h2>
              <div className="space-y-3">
                {group.plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    hostName={profile.display_name}
                    hostUsername={profile.username}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-8">
        <PitchPrompt targetUserId={profile.id} hostName={profile.display_name} />
      </div>
    </ViewerProvider>
  );
}

function RadarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="mt-3 h-7 w-40" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="mt-10 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    </div>
  );
}
