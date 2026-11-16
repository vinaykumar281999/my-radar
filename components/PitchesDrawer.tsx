"use client";

import { useState } from "react";
import { Lightbulb, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CategoryLabel } from "@/components/plan-meta";
import { ContactChip } from "@/components/ContactChip";
import { publicAttribution } from "@/lib/contact";
import { createClient } from "@/lib/supabase/client";
import type { Pitch, Plan } from "@/lib/types";

type PitchesDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pitches: Pitch[];
  /** Called once a pitch is accepted or dismissed (remove it from the list). */
  onResolved: (pitchId: string) => void;
  onPlanAdded: (plan: Plan) => void;
};

export function PitchesDrawer({ open, onOpenChange, pitches, onResolved, onPlanAdded }: PitchesDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-lg font-bold">
            <Lightbulb className="size-5" /> Friend pitches
          </DrawerTitle>
          <DrawerDescription className="text-left">Ideas friends sent from your public page.</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pitches.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-semibold">No pitches yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Friends can pitch ideas from the bottom of your Radar page.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pitches.map((pitch) => (
                <PitchRow
                  key={pitch.id}
                  pitch={pitch}
                  onResolved={onResolved}
                  onPlanAdded={onPlanAdded}
                />
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PitchRow({
  pitch,
  onResolved,
  onPlanAdded,
}: {
  pitch: Pitch;
  onResolved: (pitchId: string) => void;
  onPlanAdded: (plan: Plan) => void;
}) {
  const [pending, setPending] = useState<"accept" | "dismiss" | null>(null);

  async function accept() {
    setPending("accept");
    // One transaction server-side: marks the pitch accepted and creates the plan,
    // only if it's still pending — so a double tap / second tab can't duplicate it.
    const { data: plan, error } = await createClient()
      .rpc("accept_pitch", {
        p_pitch_id: pitch.id,
        p_suggested_by: publicAttribution(pitch.pitcher_handle, pitch.pitcher_name),
      })
      .single<Plan>();
    if (error || !plan) {
      if (error?.message.includes("pitch_not_pending")) {
        // Already accepted/dismissed elsewhere — just drop it from the list.
        onResolved(pitch.id);
        toast("That pitch was already handled.");
      } else {
        setPending(null);
        toast.error("Couldn't add that plan.");
      }
      return;
    }
    onPlanAdded(plan);
    onResolved(pitch.id);
    toast.success("Added to your Radar");
  }

  async function dismiss() {
    setPending("dismiss");
    const { error } = await createClient().from("plan_pitches").update({ status: "dismissed" }).eq("id", pitch.id);
    if (error) {
      setPending(null);
      toast.error("Couldn't dismiss that pitch.");
      return;
    }
    onResolved(pitch.id);
  }

  return (
    <li className="rounded-xl border bg-card p-3.5">
      <CategoryLabel category={pitch.category} />
      <p className="mt-1 leading-snug font-bold">{pitch.title}</p>
      <p className="text-xs text-muted-foreground">{pitch.timeframe}</p>
      {pitch.notes && <p className="mt-2 text-sm text-foreground/80">{pitch.notes}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">from</span>
        <span className="font-semibold">{pitch.pitcher_name}</span>
        <ContactChip contact={pitch.pitcher_handle} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={accept} disabled={!!pending} className="h-10 flex-1 rounded-xl font-semibold">
          {pending === "accept" ? <Loader2 className="animate-spin" /> : <Plus />}
          Add to My Radar
        </Button>
        <Button
          variant="outline"
          onClick={dismiss}
          disabled={!!pending}
          className="h-10 rounded-xl"
          aria-label="Dismiss pitch"
        >
          {pending === "dismiss" ? <Loader2 className="animate-spin" /> : <X />}
          Dismiss
        </Button>
      </div>
    </li>
  );
}
