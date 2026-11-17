"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsernameField, useUsernameAvailability } from "@/components/UsernameField";
import { createClient } from "@/lib/supabase/client";

export function OnboardingForm({
  userId,
  suggestedUsername,
  next = "/dashboard",
}: {
  userId: string;
  suggestedUsername: string;
  /** Where to go once the profile exists (already validated by safeNext). */
  next?: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestedUsername.length >= 3 ? suggestedUsername : "");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { availability, markTaken } = useUsernameAvailability(username);

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
      if (error.code === "23505") markTaken();
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <UsernameField value={username} onChange={setUsername} availability={availability} />

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
