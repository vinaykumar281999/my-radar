"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BlockedContact } from "@/lib/types";

export function PausePitches({ userId, initialPaused }: { userId: string; initialPaused: boolean }) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !paused;
    setPending(true);
    setPaused(next);
    const { error } = await createClient().from("profiles").update({ pitches_paused: next }).eq("id", userId);
    setPending(false);
    if (error) {
      setPaused(!next);
      toast.error("Couldn't update that setting.");
      return;
    }
    toast.success(next ? "Pitches paused" : "Pitches are open again");
    router.refresh();
  }

  return (
    <section className="tap-card flex items-start gap-4 p-5">
      <div className="min-w-0 flex-1">
        <h2 className="font-bold" id="pause-label">
          Pause pitches
        </h2>
        <p className="mt-1 text-sm text-muted-foreground" id="pause-desc">
          Hides the “Got an idea?” card on your page and turns away new pitches. Interest on your plans still works.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={paused}
        aria-labelledby="pause-label"
        aria-describedby="pause-desc"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
          paused ? "bg-foreground" : "bg-muted ring-1 ring-border ring-inset",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow transition-transform",
            paused ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </section>
  );
}

export function BlockedList({ initialBlocked }: { initialBlocked: BlockedContact[] }) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function unblock(entry: BlockedContact) {
    setPendingId(entry.id);
    const { error } = await createClient().from("blocked_contacts").delete().eq("id", entry.id);
    setPendingId(null);
    if (error) {
      toast.error("Couldn't unblock.");
      return;
    }
    setBlocked((b) => b.filter((x) => x.id !== entry.id));
    toast.success(`Unblocked ${entry.label ?? entry.contact_key}`);
  }

  return (
    <section className="tap-card p-5">
      <h2 className="font-bold">Blocked senders</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        They can still open your page, but their pitches and interest are silently dropped.
      </p>
      {blocked.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No one blocked. Block from the Pitches or Interested lists.</p>
      ) : (
        <ul className="mt-4 divide-y rounded-xl border">
          {blocked.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.label ?? entry.contact_key}</span>
              <Button size="sm" variant="outline" onClick={() => unblock(entry)} disabled={pendingId === entry.id}>
                {pendingId === entry.id && <Loader2 className="animate-spin" />}
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
