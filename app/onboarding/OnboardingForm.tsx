"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHost } from "@/hooks/use-origin";
import { createClient } from "@/lib/supabase/client";
import { RESERVED_USERNAMES, USERNAME_RE } from "@/lib/types";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

export function OnboardingForm({ userId, suggestedUsername }: { userId: string; suggestedUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestedUsername.length >= 3 ? suggestedUsername : "");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  // Result of the last async lookup, keyed by the username it was for.
  const [lookup, setLookup] = useState<{ username: string; result: "available" | "taken" | "idle" } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = useHost() || "radar.app";

  const isValid = USERNAME_RE.test(username) && !RESERVED_USERNAMES.has(username);
  const availability: Availability = !username
    ? "idle"
    : !isValid
      ? "invalid"
      : lookup?.username === username
        ? lookup.result
        : "checking";

  // Debounced availability check.
  useEffect(() => {
    if (!isValid) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await createClient()
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (cancelled) return;
      setLookup({ username, result: error ? "idle" : data ? "taken" : "available" });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, isValid]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (availability === "invalid" || availability === "taken") return;
    if (!displayName.trim()) {
      setError("Add the name your friends know you by.");
      return;
    }
    setPending(true);
    const { error } = await createClient().from("profiles").insert({
      id: userId,
      username,
      display_name: displayName.trim(),
      bio: bio.trim() || null,
    });
    if (error) {
      setPending(false);
      setError(error.code === "23505" ? "That username was just taken — try another." : error.message);
      if (error.code === "23505") setLookup({ username, result: "taken" });
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <div className="flex h-11 items-center rounded-lg border border-input bg-transparent pr-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <span className="pl-3 text-base text-muted-foreground select-none">{host}/</span>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
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
            ? RESERVED_USERNAMES.has(username)
              ? "That one's reserved."
              : "3–30 characters: lowercase letters, numbers, underscores."
            : availability === "taken"
              ? "Already taken — try another."
              : availability === "available"
                ? "Nice, it's yours!"
                : "Lowercase letters, numbers, and underscores."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Maya Chen"
          maxLength={60}
          required
          className="h-11 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="bio">One-line bio</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{bio.length}/120</span>
        </div>
        <Input
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Always down for a concert or weekend trail"
          maxLength={120}
          className="h-11 text-base"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || availability === "invalid" || availability === "taken" || availability === "checking"}
        className="h-12 w-full rounded-xl text-base font-semibold"
      >
        {pending ? <Loader2 className="animate-spin" /> : "Claim my Radar 🚀"}
      </Button>
    </form>
  );
}

function AvailabilityIcon({ state }: { state: Availability }) {
  if (state === "checking") return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (state === "available") return <Check className="size-4 text-emerald-500" />;
  if (state === "taken" || state === "invalid") return <X className="size-4 text-destructive" />;
  return null;
}
