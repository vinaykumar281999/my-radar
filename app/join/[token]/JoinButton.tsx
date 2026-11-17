"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Joining is a write, so it never happens on page load alone; it runs on tap,
 * or automatically only when the visitor just came back from sign-in (?auto=1).
 */
export function JoinButton({
  token,
  ownerUsername,
  circleName,
  auto,
}: {
  token: string;
  ownerUsername: string;
  circleName: string;
  auto: boolean;
}) {
  // Coming back from sign-in: start already "pending" and join right away.
  const [state, setState] = useState<"idle" | "pending" | "joined" | "error">(auto ? "pending" : "idle");
  const started = useRef(false);

  async function redeem() {
    if (started.current) return;
    started.current = true;
    const { data, error } = await createClient().rpc("redeem_circle_invite", { p_token: token });
    const status = (data as { status?: string } | null)?.status;
    started.current = false;
    setState(error || !status ? "error" : "joined");
  }

  function join() {
    setState("pending");
    void redeem();
  }

  useEffect(() => {
    if (auto) void redeem();
    // Once on mount; redeem() guards against repeats (e.g. Strict Mode).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "joined") {
    return (
      <div className="mt-6">
        <p className="font-semibold">You&apos;re in {circleName} 🎉</p>
        <Button
          render={<Link href={`/${ownerUsername}`} />}
          nativeButton={false}
          className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
        >
          See @{ownerUsername}&apos;s plans
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button onClick={join} disabled={state === "pending"} className="mt-6 h-12 w-full rounded-xl text-base font-semibold">
        {state === "pending" ? <Loader2 className="animate-spin" /> : `Join ${circleName}`}
      </Button>
      {state === "error" && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Couldn&apos;t join. The link may have just expired. Try again or ask for a new one.
        </p>
      )}
    </>
  );
}
