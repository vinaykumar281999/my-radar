"use client";

import { useEffect, useState } from "react";
import { Lock, MapPin } from "lucide-react";
import { ContactChip } from "@/components/ContactChip";
import { createClient } from "@/lib/supabase/client";
import type { PlanPrivateDetails } from "@/lib/types";

/**
 * Pickup spot + driver contact for an approved rider. RLS only returns the row
 * to the owner and to approved riders who can still see the plan, so this
 * component can't show it to anyone else even if it were rendered for them.
 */
export function CarpoolDetails({ planId }: { planId: string }) {
  const [details, setDetails] = useState<PlanPrivateDetails | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("plan_private_details")
      .select("*")
      .eq("plan_id", planId)
      .maybeSingle<PlanPrivateDetails>()
      .then(({ data }) => {
        if (!cancelled) setDetails(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (details === undefined) return null;

  return (
    <div className="mt-3 space-y-1.5 rounded-xl bg-muted px-3 py-2.5 text-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        <Lock className="size-3" /> For approved riders
      </p>
      {details?.pickup_details ? (
        <p className="flex items-start gap-1.5 font-medium">
          <MapPin className="mt-0.5 size-3.5 shrink-0" /> {details.pickup_details}
        </p>
      ) : (
        <p className="text-muted-foreground">The driver hasn&apos;t added the pickup spot yet.</p>
      )}
      {details?.owner_contact && (
        <p className="flex items-center gap-2">
          <span className="text-muted-foreground">Driver:</span>
          <ContactChip contact={details.owner_contact} />
        </p>
      )}
    </div>
  );
}
