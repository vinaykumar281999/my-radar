"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpCircle, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  PROMOTION_DISMISSED_EVENT,
  noticesForOwner,
  promotionHref,
  promotionMessage,
  type PromotionNotice,
} from "@/lib/promotion-notices";
import { cn } from "@/lib/utils";

/** Mark notices seen and tell the rest of the page (plan cards) right away. */
export async function dismissPromotionNotices(ids: string[]) {
  const supabase = createClient();
  const results = await Promise.all(ids.map((id) => supabase.rpc("dismiss_promotion_notice", { p_interest_id: id })));
  const ok = ids.filter((_, i) => !results[i].error);
  if (ok.length) window.dispatchEvent(new CustomEvent(PROMOTION_DISMISSED_EVENT, { detail: ok }));
  return ok.length === ids.length;
}

/**
 * "You're off the waitlist for <plan>" banners for the signed-in viewer's own
 * requests. Loaded in the browser only (my_promotion_notices answers only for
 * the caller), so server-rendered HTML never changes. Pass viewerId = null
 * while the viewer is unknown or signed out: nothing is fetched or shown.
 * On a profile, ownerUsername limits them to that person's plans.
 */
export function PromotionNotices({
  viewerId,
  ownerUsername,
  className,
}: {
  viewerId: string | null;
  ownerUsername?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<{ viewerId: string; notices: PromotionNotice[] } | null>(null);
  const all = viewerId && loaded?.viewerId === viewerId ? loaded.notices : [];
  const notices = ownerUsername ? noticesForOwner(all, ownerUsername) : all;

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    createClient()
      .rpc("my_promotion_notices")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("my_promotion_notices", error);
        setLoaded({ viewerId, notices: (data as PromotionNotice[] | null) ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  // Dismissed elsewhere (e.g. another banner list on the page): drop them here too.
  useEffect(() => {
    const onDismissed = (e: Event) => {
      const ids = new Set((e as CustomEvent<string[]>).detail);
      setLoaded((l) => (l ? { ...l, notices: l.notices.filter((n) => !ids.has(n.interest_id)) } : l));
    };
    window.addEventListener(PROMOTION_DISMISSED_EVENT, onDismissed);
    return () => window.removeEventListener(PROMOTION_DISMISSED_EVENT, onDismissed);
  }, []);

  if (notices.length === 0) return null;

  async function dismiss(targets: PromotionNotice[], { quiet = false } = {}) {
    const prev = loaded;
    const ids = new Set(targets.map((n) => n.interest_id));
    setLoaded((l) => (l ? { ...l, notices: l.notices.filter((n) => !ids.has(n.interest_id)) } : l));
    if (!(await dismissPromotionNotices([...ids])) && !quiet) {
      setLoaded(prev);
      toast.error("Couldn't dismiss that.");
    }
  }

  return (
    <section aria-label="Off the waitlist" className={cn("space-y-2", className)}>
      {notices.map((n) => (
        <div
          key={n.interest_id}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm"
        >
          <ArrowUpCircle className="size-4 shrink-0 text-primary" />
          {/* Tapping opens the plan and counts as seen (navigation isn't held up by it). */}
          <Link
            href={promotionHref(n)}
            onClick={() => void dismiss([n], { quiet: true })}
            className="min-w-0 flex-1 underline-offset-2 hover:underline"
          >
            {promotionMessage(n)}
          </Link>
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
      {notices.length > 1 && (
        <div className="flex justify-end text-xs">
          <button type="button" onClick={() => dismiss(notices)} className="font-medium text-muted-foreground hover:text-foreground">
            Dismiss all
          </button>
        </div>
      )}
    </section>
  );
}
