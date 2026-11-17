"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, LogOut, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cleanUsername } from "@/components/UsernameField";
import { copyText } from "@/components/ShareButton";
import { useOrigin } from "@/hooks/use-origin";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { inviteIsActive, type Circle, type CircleInvite, type CircleMember } from "@/lib/types";

export type OwnedCircle = Circle & { members: CircleMember[]; invites: CircleInvite[] };
export type Membership = { circle_id: string; name: string; owner_username: string; owner_display_name: string };

// FK hints: circles and profiles are also linked through circle_members, which is ambiguous for PostgREST.
export const MEMBER_SELECT =
  "circle_id, user_id, added_at, invite_id, seen_at, profiles!circle_members_user_id_fkey(username, display_name)";

export function CirclesSettings({
  userId,
  initialCircles,
  initialMemberships,
}: {
  userId: string;
  initialCircles: OwnedCircle[];
  initialMemberships: Membership[];
}) {
  const [circles, setCircles] = useState(initialCircles);
  const [memberships, setMemberships] = useState(initialMemberships);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  // Captured once so render stays pure; links are re-checked on the server anyway.
  const [now] = useState(() => Date.now());

  function updateCircle(id: string, update: (c: OwnedCircle) => OwnedCircle) {
    setCircles((cs) => cs.map((c) => (c.id === id ? update(c) : c)));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const { data, error } = await createClient()
      .from("circles")
      .insert({ owner_id: userId, name })
      .select()
      .single<Circle>();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.code === "23505" ? "You already have a circle with that name." : "Couldn't create the circle.");
      return;
    }
    setCircles((cs) => [...cs, { ...data, members: [], invites: [] }]);
    setNewName("");
  }

  async function leave(m: Membership) {
    const { error } = await createClient()
      .from("circle_members")
      .delete()
      .eq("circle_id", m.circle_id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Couldn't leave that circle.");
      return;
    }
    setMemberships((ms) => ms.filter((x) => x.circle_id !== m.circle_id));
    toast.success(`Left ${m.name}`);
  }

  return (
    <section className="tap-card p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Users className="size-4" /> Circles
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Share plans with just these people. Members must be signed in to see them. They can see the circle&apos;s
        name, but not who else is in it.
      </p>

      <div className="mt-4 space-y-3">
        {circles.map((circle) => (
          <CircleCard
            key={circle.id}
            circle={circle}
            userId={userId}
            now={now}
            onChange={(update) => updateCircle(circle.id, update)}
            onDeleted={() => setCircles((cs) => cs.filter((c) => c.id !== circle.id))}
          />
        ))}
      </div>

      <form onSubmit={create} className="mt-3 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={circles.length ? "New circle" : "Your first circle, e.g. College"}
          maxLength={40}
          aria-label="New circle name"
          className="h-10 text-base"
        />
        <Button type="submit" disabled={creating || !newName.trim()} className="h-10 rounded-lg">
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} Create
        </Button>
      </form>

      {memberships.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Circles you&apos;re in</h3>
          <ul className="mt-2 divide-y rounded-xl border">
            {memberships.map((m) => (
              <li key={m.circle_id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-muted-foreground">by @{m.owner_username}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => leave(m)}>
                  <LogOut /> Leave
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CircleCard({
  circle,
  userId,
  now,
  onChange,
  onDeleted,
}: {
  circle: OwnedCircle;
  userId: string;
  now: number;
  onChange: (update: (c: OwnedCircle) => OwnedCircle) => void;
  onDeleted: () => void;
}) {
  const origin = useOrigin();
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState<CircleMember | null>(null);
  const activeInvites = circle.invites.filter((i) => inviteIsActive(i, now));

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const name = cleanUsername(username);
    if (!name) return;
    setAdding(true);
    const supabase = createClient();
    const { data: found } = await supabase.from("profiles").select("id").eq("username", name).maybeSingle<{ id: string }>();
    if (!found) {
      setAdding(false);
      toast.error(`No one is @${name} on Radar.`);
      return;
    }
    if (found.id === userId) {
      setAdding(false);
      toast.error("That's you. You always see your own plans.");
      return;
    }
    const { data, error } = await supabase
      .from("circle_members")
      .insert({ circle_id: circle.id, user_id: found.id })
      .select(MEMBER_SELECT)
      .single<CircleMember>();
    setAdding(false);
    if (error || !data) {
      toast.error(error?.code === "23505" ? `@${name} is already in ${circle.name}.` : "Couldn't add them.");
      return;
    }
    onChange((c) => ({ ...c, members: [...c.members, data] }));
    setUsername("");
    toast.success(`Added @${name} to ${circle.name}`);
  }

  async function removeMember(member: CircleMember, revokeInvite: boolean) {
    const supabase = createClient();
    const { error } = await supabase
      .from("circle_members")
      .delete()
      .eq("circle_id", circle.id)
      .eq("user_id", member.user_id);
    if (error) {
      toast.error("Couldn't remove them.");
      return;
    }
    let revokedAt: string | null = null;
    if (revokeInvite && member.invite_id) {
      revokedAt = new Date().toISOString();
      const { error: revokeError } = await supabase
        .from("circle_invites")
        .update({ revoked_at: revokedAt })
        .eq("id", member.invite_id);
      if (revokeError) {
        revokedAt = null;
        toast.error("Removed them, but couldn't revoke the link.");
      }
    }
    onChange((c) => ({
      ...c,
      members: c.members.filter((m) => m.user_id !== member.user_id),
      invites: revokedAt ? c.invites.map((i) => (i.id === member.invite_id ? { ...i, revoked_at: revokedAt } : i)) : c.invites,
    }));
    toast.success(`Removed @${member.profiles?.username ?? "member"}${revokedAt ? " and revoked their link" : ""}`);
  }

  async function createInvite() {
    const { data, error } = await createClient()
      .from("circle_invites")
      .insert({ circle_id: circle.id })
      .select()
      .single<CircleInvite>();
    if (error || !data) {
      toast.error("Couldn't create a link.");
      return;
    }
    onChange((c) => ({ ...c, invites: [...c.invites, data] }));
    if (await copyText(`${window.location.origin}/join/${data.token}`)) {
      toast.success("Invite link copied", { description: "Works for 7 days, up to 25 people." });
    }
  }

  async function revokeInvite(invite: CircleInvite) {
    const revokedAt = new Date().toISOString();
    const { error } = await createClient().from("circle_invites").update({ revoked_at: revokedAt }).eq("id", invite.id);
    if (error) {
      toast.error("Couldn't revoke that link.");
      return;
    }
    onChange((c) => ({ ...c, invites: c.invites.map((i) => (i.id === invite.id ? { ...i, revoked_at: revokedAt } : i)) }));
    toast.success("Link revoked. People who already joined stay in the circle.");
  }

  async function deleteCircle() {
    const { error } = await createClient().from("circles").delete().eq("id", circle.id);
    if (error) {
      toast.error("Couldn't delete the circle.");
      return;
    }
    onDeleted();
    toast.success(`Deleted ${circle.name}`, {
      description: "Plans shared only with it are now visible to you alone.",
    });
  }

  function onRemoveClick(member: CircleMember) {
    const invite = member.invite_id ? circle.invites.find((i) => i.id === member.invite_id) : undefined;
    // Joined via a link that still works: ask whether to shut the link too.
    if (invite && inviteIsActive(invite, now)) setRemoving(member);
    else removeMember(member, false);
  }

  return (
    <div className="rounded-xl border p-3.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{circle.name}</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {circle.members.length} {circle.members.length === 1 ? "person" : "people"}
        </span>
        <Button
          size="icon-sm"
          variant={confirmDelete ? "destructive" : "ghost"}
          onClick={() => (confirmDelete ? deleteCircle() : setConfirmDelete(true))}
          aria-label={confirmDelete ? `Confirm deleting ${circle.name}` : `Delete ${circle.name}`}
          className={cn(!confirmDelete && "text-muted-foreground")}
        >
          <Trash2 />
        </Button>
      </div>
      {confirmDelete && <p className="mt-1 text-xs text-destructive">Tap again to delete this circle.</p>}

      {circle.members.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {circle.members.map((m) => (
            <li
              key={m.user_id}
              className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs font-medium"
            >
              @{m.profiles?.username ?? "unknown"}
              {m.invite_id && (
                <Link2 className="size-3 text-muted-foreground" aria-label="joined via invite link" />
              )}
              <button
                type="button"
                onClick={() => onRemoveClick(m)}
                className="grid size-5 place-items-center rounded-full hover:bg-background"
                aria-label={`Remove @${m.profiles?.username ?? "member"}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addMember} className="mt-3 flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Add by username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={`Add someone to ${circle.name} by username`}
          className="h-9 text-base"
        />
        <Button type="submit" size="sm" variant="outline" disabled={adding || !username.trim()} className="h-9">
          {adding ? <Loader2 className="animate-spin" /> : <UserPlus />} Add
        </Button>
      </form>

      <div className="mt-3 space-y-1.5">
        {activeInvites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} now={now} url={origin ? `${origin}/join/${invite.token}` : ""} onRevoke={() => revokeInvite(invite)} />
        ))}
        <Button size="sm" variant="ghost" onClick={createInvite} className="text-muted-foreground">
          <Link2 /> {activeInvites.length ? "Another invite link" : "Create invite link"}
        </Button>
      </div>

      <RemoveMemberDialog
        key={removing?.user_id ?? "none"}
        member={removing}
        circleName={circle.name}
        othersOnLink={removing ? circle.members.filter((m) => m.invite_id === removing.invite_id).length - 1 : 0}
        onCancel={() => setRemoving(null)}
        onConfirm={(revoke) => {
          if (removing) removeMember(removing, revoke);
          setRemoving(null);
        }}
      />
    </div>
  );
}

function InviteRow({
  invite,
  now,
  url,
  onRevoke,
}: {
  invite: CircleInvite;
  now: number;
  url: string;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const days = Math.max(1, Math.ceil((new Date(invite.expires_at).getTime() - now) / 86_400_000));

  async function copy() {
    if (url && (await copyText(url))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
      <button type="button" onClick={copy} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-label="Copy invite link">
        {copied ? <Check className="size-3.5 shrink-0 text-emerald-500" /> : <Copy className="size-3.5 shrink-0" />}
        <span className="truncate font-mono">{url || "…"}</span>
      </button>
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {invite.uses}/{invite.max_uses} · {days}d
      </span>
      <button type="button" onClick={onRevoke} className="shrink-0 font-semibold hover:underline">
        Revoke
      </button>
    </div>
  );
}

function RemoveMemberDialog({
  member,
  circleName,
  othersOnLink,
  onCancel,
  onConfirm,
}: {
  member: CircleMember | null;
  circleName: string;
  othersOnLink: number;
  onCancel: () => void;
  onConfirm: (revokeInvite: boolean) => void;
}) {
  const [revoke, setRevoke] = useState(true);
  const handle = member?.profiles?.username ?? "member";

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Remove @{handle} from {circleName}?
          </DialogTitle>
          <DialogDescription>They joined with an invite link that still works, so they could rejoin.</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={revoke}
            onChange={(e) => setRevoke(e.target.checked)}
            className="mt-0.5 size-4 accent-foreground"
          />
          <span>
            Also revoke that invite link
            {othersOnLink > 0 && (
              <span className="block text-xs text-muted-foreground">
                {othersOnLink} other {othersOnLink === 1 ? "person" : "people"} joined with it and will stay in.
              </span>
            )}
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(revoke)}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
