"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useHost } from "@/hooks/use-origin";
import { checkUsernameAvailable } from "@/lib/actions/username";
import { RESERVED_USERNAMES } from "@/lib/types";
import { cleanUsername, isValidUsername } from "@/lib/username";

export { cleanUsername };

/** "limited": too many signed-out checks from this network; never blocks submitting (the database decides). */
export type Availability = "idle" | "current" | "checking" | "available" | "taken" | "invalid" | "limited";

/**
 * Debounced availability check. Old usernames are reserved for their original
 * owner, so this asks the database (username_available, through the
 * checkUsernameAvailable server action, which rate-limits signed-out checks)
 * rather than reading profiles directly. `current` is the caller's existing
 * username, if any.
 */
export function useUsernameAvailability(username: string, current?: string, delayMs = 350) {
  // Result of the last async lookup, keyed by the username it was for.
  const [lookup, setLookup] = useState<{ username: string; result: "available" | "taken" | "limited" | "idle" } | null>(null);

  const isValid = isValidUsername(username);
  const isCurrent = !!current && username === current;

  const availability: Availability = !username
    ? "idle"
    : isCurrent
      ? "current"
      : !isValid
        ? "invalid"
        : lookup?.username === username
          ? lookup.result
          : "checking";

  useEffect(() => {
    if (!isValid || isCurrent) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await checkUsernameAvailable(username);
      if (cancelled) return;
      setLookup({
        username,
        result:
          result === "available" || result === "taken"
            ? result
            : result === "rate_limited"
              ? "limited"
              : // "invalid" can't happen here (checked above); "error" just means "don't know".
                "idle",
      });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, isValid, isCurrent, delayMs]);

  return {
    availability,
    /** Call after the server reports the name was taken in the meantime. */
    markTaken: () => setLookup({ username, result: "taken" }),
  };
}

export function UsernameField({
  value,
  onChange,
  availability,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  availability: Availability;
  /** Extra line shown once a new name is confirmed available. */
  hint?: string;
}) {
  const host = useHost() || "radar.app";

  return (
    <div className="space-y-1.5">
      <Label htmlFor="username">Username</Label>
      <div className="flex h-11 items-center rounded-lg border border-input bg-transparent pr-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        <span className="pl-3 text-base text-muted-foreground select-none">{host}/</span>
        <input
          id="username"
          value={value}
          onChange={(e) => onChange(cleanUsername(e.target.value))}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="yourname"
          required
          className="h-full min-w-0 flex-1 bg-transparent text-base font-medium outline-none"
          aria-describedby="username-hint"
        />
        <AvailabilityIcon state={availability} />
      </div>
      <p id="username-hint" className="text-xs text-muted-foreground" aria-live="polite">
        {availability === "invalid"
          ? RESERVED_USERNAMES.has(value)
            ? "That one's reserved."
            : "3–30 characters: lowercase letters, numbers, underscores."
          : availability === "taken"
            ? "Already taken — try another."
            : availability === "limited"
              ? "Too many checks from your network. Try again in a minute."
            : availability === "available"
              ? (hint ?? "Nice, it's yours!")
              : availability === "current"
                ? "This is your current username."
                : "Lowercase letters, numbers, and underscores."}
      </p>
    </div>
  );
}

function AvailabilityIcon({ state }: { state: Availability }) {
  if (state === "checking") return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (state === "available") return <Check className="size-4 text-emerald-500" />;
  if (state === "taken" || state === "invalid") return <X className="size-4 text-destructive" />;
  return null;
}
