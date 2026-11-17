"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsernameField, useUsernameAvailability } from "@/components/UsernameField";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export function ProfileSettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [saved, setSaved] = useState(profile);
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { availability, markTaken } = useUsernameAvailability(username, saved.username);

  const dirty =
    username !== saved.username || displayName.trim() !== saved.display_name || (bio.trim() || null) !== saved.bio;
  const usernameOk = availability === "current" || availability === "available";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!usernameOk) return;
    if (!displayName.trim()) {
      setError("Add the name your friends know you by.");
      return;
    }
    setPending(true);
    const { data, error } = await createClient()
      .from("profiles")
      .update({ username, display_name: displayName.trim(), bio: bio.trim() || null })
      .eq("id", saved.id)
      .select()
      .single<Profile>();
    setPending(false);

    if (error || !data) {
      if (error?.code === "23505") {
        markTaken();
        setError("That username was just taken — try another.");
      } else if (error?.message.includes("too_many_username_changes")) {
        setError("You've changed your username a lot. Reach out if you need another change.");
      } else {
        setError(error?.message ?? "Couldn't save.");
      }
      return;
    }

    if (data.username !== saved.username) {
      toast.success(`You're now @${data.username}`, {
        description: `Links to /${saved.username} redirect here.`,
      });
    } else {
      toast.success("Profile saved");
    }
    setSaved(data);
    router.refresh();
  }

  return (
    <section className="tap-card p-5">
      <h2 className="font-bold">Profile</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-5">
        <UsernameField
          value={username}
          onChange={setUsername}
          availability={availability}
          hint={`Available. Old links to /${saved.username} will keep working.`}
        />

        <div className="space-y-1.5">
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
            maxLength={120}
            className="h-11 text-base"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending || !dirty || !usernameOk} className="h-11 w-full rounded-xl font-semibold">
          {pending ? <Loader2 className="animate-spin" /> : "Save changes"}
        </Button>
        {username !== saved.username && (
          <p className="text-xs text-muted-foreground">
            Your old username stays reserved for you, and /{saved.username} permanently redirects to your new link.
          </p>
        )}
      </form>
    </section>
  );
}
