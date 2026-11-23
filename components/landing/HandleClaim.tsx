"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUsernameAvailability } from "@/components/UsernameField";
import { useHost } from "@/hooks/use-origin";
import { RESERVED_USERNAMES } from "@/lib/types";
import { claimHref, cleanUsername } from "@/lib/username";
import { cn } from "@/lib/utils";

/**
 * "radar.app/[handle] [Claim →]". Checks the shape as you type and asks
 * username_available (debounced) whether it's free. Claim goes to sign-up
 * with the handle carried through to onboarding; nothing is reserved here.
 */
export function HandleClaim({ className }: { className?: string }) {
  const router = useRouter();
  const host = useHost() || "radar.app";
  const [handle, setHandle] = useState("");
  const { availability } = useUsernameAvailability(handle, undefined, 400);
  const blocked = availability === "taken" || availability === "invalid";

  function claim(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    router.push(claimHref(handle));
  }

  return (
    <form onSubmit={claim} className={cn("w-full max-w-md", className)}>
      <div
        className={cn(
          "flex h-14 items-center gap-1 rounded-full border-2 bg-card pr-1.5 pl-4 shadow-lg shadow-primary/15 transition-colors focus-within:border-primary",
          blocked && handle ? "border-destructive/60" : "border-border",
        )}
      >
        <label htmlFor="claim-handle" className="shrink-0 text-base text-muted-foreground select-none">
          {host}/
        </label>
        <input
          id="claim-handle"
          value={handle}
          onChange={(e) => setHandle(cleanUsername(e.target.value))}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="claim-status"
          aria-invalid={blocked && !!handle}
          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal"
        />
        <Button type="submit" disabled={blocked} className="h-11 shrink-0 rounded-full px-5 text-base font-semibold">
          Claim <ArrowRight />
        </Button>
      </div>
      <p id="claim-status" aria-live="polite" className="mt-2 min-h-5 px-4 text-left text-sm">
        <ClaimStatus handle={handle} availability={availability} />
      </p>
    </form>
  );
}

function ClaimStatus({ handle, availability }: { handle: string; availability: ReturnType<typeof useUsernameAvailability>["availability"] }) {
  switch (availability) {
    case "idle":
      return <span className="text-muted-foreground">Free · 30-second setup</span>;
    case "checking":
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Checking…
        </span>
      );
    case "available":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" /> available
        </span>
      );
    case "taken":
      return <span className="font-medium text-destructive">taken</span>;
    case "invalid":
      return (
        <span className="text-destructive">
          {RESERVED_USERNAMES.has(handle) ? "That one's reserved" : "3–30 letters, numbers or _"}
        </span>
      );
    default:
      return null;
  }
}
