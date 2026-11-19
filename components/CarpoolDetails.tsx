"use client";

import { useEffect, useState } from "react";
import { Lock, MapPin, StickyNote } from "lucide-react";
import { ContactChip } from "@/components/ContactChip";
import { createClient } from "@/lib/supabase/client";
import { riderFlagSummary, type Interest, type PlanPrivateDetails } from "@/lib/types";

/**
 * Pickup spot, driver contact and driver's note for an approved rider. RLS only
 * returns the row to the owner and to approved riders who can still see the
 * plan, so this component can't show it to anyone else even if it were
 * rendered for them.
 *
 * For the owner (isOwner) it also summarizes approved riders' flags. Those are
 * read from interests, where RLS gives the owner every row and anyone else
 * only their own, so the summary is only rendered for the owner.
 */
export function CarpoolDetails({ planId, isOwner = false }: { planId: string; isOwner?: boolean }) {
  const [details, setDetails] = useState<PlanPrivateDetails | null | undefined>(undefined);
  const [riders, setRiders] = useState<Pick<Interest, "can_drive" | "large_bag">[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("plan_private_details")
      .select("*")
      .eq("plan_id", planId)
      .maybeSingle<PlanPrivateDetails>()
      .then(({ data }) => {
        if (!cancelled) setDetails(data ?? null);
      });
    if (isOwner) {
      supabase
        .from("interests")
        .select("can_drive, large_bag")
        .eq("plan_id", planId)
        .eq("status", "approved")
        .returns<Pick<Interest, "can_drive" | "large_bag">[]>()
        .then(({ data }) => {
          if (!cancelled) setRiders(data ?? []);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [planId, isOwner]);

  if (details === undefined) return null;
  const summary = isOwner ? riderFlagSummary(riders) : "";

  return (
    <div className="mt-3 space-y-1.5 rounded-xl bg-muted px-3 py-2.5 text-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        <Lock className="size-3" /> {isOwner ? "You and approved riders" : "For approved riders"}
      </p>
      {details?.pickup_details ? (
        <p className="flex items-start gap-1.5 font-medium">
          <MapPin className="mt-0.5 size-3.5 shrink-0" /> {details.pickup_details}
        </p>
      ) : (
        <p className="text-muted-foreground">
          {isOwner ? "You haven't added the pickup spot yet." : "The driver hasn't added the pickup spot yet."}
        </p>
      )}
      {details?.rider_note && (
        <p className="flex items-start gap-1.5">
          <StickyNote className="mt-0.5 size-3.5 shrink-0" /> {details.rider_note}
        </p>
      )}
      {details?.owner_contact && !isOwner && (
        <p className="flex items-center gap-2">
          <span className="text-muted-foreground">Driver:</span>
          <ContactChip contact={details.owner_contact} />
        </p>
      )}
      {summary && <p className="text-xs font-medium text-muted-foreground">Riders: {summary}</p>}
    </div>
  );
}
