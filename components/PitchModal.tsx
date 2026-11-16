"use client";

import { useState } from "react";
import { Lightbulb, Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillGroup } from "@/components/PillGroup";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, TIMEFRAMES, type Category, type Timeframe } from "@/lib/types";

/** Minimal "Got an idea?" card at the bottom of a public feed; opens the pitch drawer. */
export function PitchPrompt({ targetUserId, hostName }: { targetUserId: string; hostName: string }) {
  const [open, setOpen] = useState(false);
  const firstName = hostName.split(" ")[0] || hostName;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5 text-left transition-colors hover:border-foreground/40 hover:bg-muted/50"
      >
        <Lightbulb className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Got an idea?</span>
          <span className="block truncate text-sm text-muted-foreground">Pitch a plan to {hostName}</span>
        </span>
        <span className="text-sm font-semibold">Pitch →</span>
      </button>
      <PitchModal open={open} onOpenChange={setOpen} targetUserId={targetUserId} hostFirstName={firstName} />
    </>
  );
}

function PitchModal({
  open,
  onOpenChange,
  targetUserId,
  hostFirstName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  hostFirstName: string;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("Weekend");
  const [timeframe, setTimeframe] = useState<Timeframe>("This Month");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next && sent) {
      setTimeout(() => {
        setSent(false);
        setTitle("");
        setNotes("");
      }, 300);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !name.trim() || !handle.trim()) {
      setError("Add the idea, your name, and how to reach you.");
      return;
    }
    setPending(true);
    const { error } = await createClient()
      .from("plan_pitches")
      .insert({
        target_user_id: targetUserId,
        title: title.trim().slice(0, 80),
        category,
        timeframe,
        pitcher_name: name.trim().slice(0, 60),
        pitcher_handle: handle.trim().slice(0, 60),
        notes: notes.trim() ? notes.trim().slice(0, 140) : null,
      });
    setPending(false);
    if (error) {
      console.error(error);
      setError("Couldn't send that — please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 pt-10 pb-8 text-center">
            <PartyPopper className="size-10" />
            <DrawerTitle className="text-xl font-bold">Pitched!</DrawerTitle>
            <DrawerDescription>
              {hostFirstName} will see your idea. If it makes the Radar, you&apos;ll get credit on the plan.
            </DrawerDescription>
            <Button className="mt-4 h-11 w-full rounded-xl" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-bold">Pitch a plan to {hostFirstName}</DrawerTitle>
              <DrawerDescription className="text-left">No account needed.</DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="space-y-1.5">
                <Label htmlFor="pitch-title">The idea</Label>
                <Input
                  id="pitch-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ramen crawl downtown"
                  maxLength={80}
                  required
                  className="h-11 text-base"
                />
              </div>
              <PillGroup<Category> label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
              <PillGroup<Timeframe> label="When" options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pitch-name">Your name</Label>
                  <Input
                    id="pitch-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex"
                    autoComplete="name"
                    maxLength={60}
                    required
                    className="h-11 text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pitch-handle">@handle or phone</Label>
                  <Input
                    id="pitch-handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@alex.rivera"
                    maxLength={60}
                    required
                    className="h-11 text-base"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pitch-notes">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="pitch-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="I know a spot with no line"
                  maxLength={140}
                  className="h-11 text-base"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If {hostFirstName} adds it, your @handle (or first name) is shown on the plan. Phone numbers are never
                shown.
              </p>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DrawerFooter>
              <Button type="submit" disabled={pending} className="h-12 rounded-xl text-base font-semibold">
                {pending ? <Loader2 className="animate-spin" /> : "Send pitch"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
