"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { JoinNotice } from "@/lib/types";

/** "<name> joined <circle> via invite link" notices on the dashboard, dismissible. */
export function JoinNotices({ initialNotices }: { initialNotices: JoinNotice[] }) {
  const [notices, setNotices] = useState(initialNotices);
  if (notices.length === 0) return null;

  async function dismiss(targets: JoinNotice[]) {
    const prev = notices;
    const keys = new Set(targets.map((n) => `${n.circle_id}:${n.user_id}`));
    setNotices((ns) => ns.filter((n) => !keys.has(`${n.circle_id}:${n.user_id}`)));
    const seenAt = new Date().toISOString();
    const supabase = createClient();
    const results = await Promise.all(
      targets.map((n) =>
        supabase.from("circle_members").update({ seen_at: seenAt }).eq("circle_id", n.circle_id).eq("user_id", n.user_id),
      ),
    );
    if (results.some((r) => r.error)) {
      setNotices(prev);
      toast.error("Couldn't dismiss that.");
    }
  }

  return (
    <section aria-label="New circle members" className="mt-4 space-y-2">
      {notices.map((n) => (
        <div key={`${n.circle_id}:${n.user_id}`} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-sm">
          <UserPlus className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{n.profiles?.display_name ?? "Someone"}</span>{" "}
            <span className="text-muted-foreground">(@{n.profiles?.username})</span> joined{" "}
            <span className="font-semibold">{n.circles?.name}</span> via invite link
          </p>
          <button
            type="button"
            onClick={() => dismiss([n])}
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex justify-end gap-3 text-xs">
        <Link href="/settings" className="font-medium text-muted-foreground hover:text-foreground">
          Manage circles
        </Link>
        {notices.length > 1 && (
          <button type="button" onClick={() => dismiss(notices)} className="font-medium text-muted-foreground hover:text-foreground">
            Dismiss all
          </button>
        )}
      </div>
    </section>
  );
}
