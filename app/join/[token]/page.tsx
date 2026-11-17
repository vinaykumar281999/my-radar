import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Radar as RadarIcon, Users } from "lucide-react";
import { JoinButton } from "./JoinButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Join a circle",
  // Invite links are secrets; keep them out of search results.
  robots: { index: false, follow: false },
};

type InvitePreview =
  | { status: "invalid" }
  | {
      status: "valid" | "own_circle" | "already_member";
      circle_name: string;
      owner_username: string;
      owner_display_name: string;
    };

export default function JoinPage({ params, searchParams }: PageProps<"/join/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 self-center text-lg font-bold tracking-tight">
        <RadarIcon className="size-5 text-primary" /> Radar
      </Link>
      <div className="tap-card p-6 text-center">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <JoinContent params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function JoinContent({
  params,
  searchParams,
}: {
  params: PageProps<"/join/[token]">["params"];
  searchParams: PageProps<"/join/[token]">["searchParams"];
}) {
  const { token } = await params;
  const auto = (await searchParams).auto === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_invite_preview", { p_token: token });
  if (error) console.error("get_invite_preview", error);
  const invite = (data ?? { status: "invalid" }) as InvitePreview;

  if (invite.status === "invalid") {
    return (
      <>
        <p className="text-4xl">🔗</p>
        <h1 className="mt-3 text-xl font-bold">This invite link doesn&apos;t work anymore</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have expired or been revoked. Ask for a new one.</p>
      </>
    );
  }

  const returnTo = `/join/${token}?auto=1`;

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    // New account: claim a username first, then come straight back and join.
    if (!profile) redirect(`/onboarding?next=${encodeURIComponent(returnTo)}`);
  }

  return (
    <>
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
        <Users className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold text-balance">
        {invite.owner_display_name} invited you to <span className="whitespace-nowrap">“{invite.circle_name}”</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;ll see the plans @{invite.owner_username} shares with this circle. Other members won&apos;t see that
        you joined.
      </p>

      {!user ? (
        <Button
          render={<Link href={`/login?next=${encodeURIComponent(returnTo)}`} />}
          nativeButton={false}
          className="mt-6 h-12 w-full rounded-xl text-base font-semibold"
        >
          Sign in to join
        </Button>
      ) : invite.status === "own_circle" ? (
        <Button render={<Link href="/settings" />} nativeButton={false} variant="outline" className="mt-6 h-11 w-full rounded-xl">
          This is your circle · Manage it
        </Button>
      ) : invite.status === "already_member" ? (
        <Button
          render={<Link href={`/${invite.owner_username}`} />}
          nativeButton={false}
          className="mt-6 h-11 w-full rounded-xl"
        >
          You&apos;re already in · See their plans
        </Button>
      ) : (
        <JoinButton token={token} ownerUsername={invite.owner_username} circleName={invite.circle_name} auto={auto} />
      )}
      {!user && <p className="mt-3 text-xs text-muted-foreground">New here? Signing in creates your account.</p>}
    </>
  );
}
