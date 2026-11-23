"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Check, Loader2, PartyPopper } from "lucide-react";
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
import { CONTACT_HINT, Honeypot } from "@/components/Honeypot";
import { useViewer } from "@/components/ViewerContext";
import { useTurnstile } from "@/hooks/use-turnstile";
import { submitPollVote } from "@/lib/actions/submit";
import { optionLabel, votesLabel, type PollCount } from "@/lib/polls";
import { submitErrorMessage } from "@/lib/submit-messages";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * "Which dates work?" on a public plan card. Counts come from plan_poll(),
 * which answers under the plan's own visibility rules and carries no names.
 * Loaded in the browser only, so server-rendered pages never change.
 */
export function DatePoll({ planId, ownerId, hostName }: { planId: string; ownerId?: string; hostName: string }) {
  const viewer = useViewer();
  const [counts, setCounts] = useState<PollCount[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [voted, setVoted] = useState(false);
  const [open, setOpen] = useState(false);
  const isOwner = !!viewer && viewer.id === ownerId;

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("plan_poll", {
      p_plan_ids: [planId],
    });
    if (error) console.error("plan_poll", error);
    setCounts((data as PollCount[] | null) ?? []);
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .rpc("plan_poll", { p_plan_ids: [planId] })
      .then(({ data, error }) => {
        if (error) console.error("plan_poll", error);
        if (!cancelled) setCounts((data as PollCount[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // A signed-in voter sees their own earlier choices ticked (RLS: own ballot only).
  useEffect(() => {
    if (!viewer || isOwner) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data: ballot } = await supabase
        .from("plan_poll_ballots")
        .select("id")
        .eq("plan_id", planId)
        .eq("user_id", viewer.id)
        .maybeSingle<{ id: string }>();
      if (!ballot) return;
      const { data: choices } = await supabase.from("plan_poll_choices").select("option_id").eq("ballot_id", ballot.id);
      if (!cancelled && choices?.length) {
        setPicked(new Set(choices.map((c: { option_id: string }) => c.option_id)));
        setVoted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, viewer, isOwner]);

  if (!counts || counts.length === 0) return null;
  const firstName = hostName.split(" ")[0] || hostName;

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-label="Date poll" className="mt-3 rounded-xl border bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarCheck className="size-4 text-primary" aria-hidden /> Which dates work?
        <span className="font-normal text-muted-foreground">Pick any</span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {counts.map((o) => {
          const on = picked.has(o.option_id);
          return (
            <li key={o.option_id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm transition-colors",
                  on ? "border-primary bg-primary/5" : "hover:border-foreground/20",
                  isOwner && "cursor-default",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(o.option_id)}
                  disabled={isOwner}
                  className="size-4 accent-primary"
                />
                <span className="flex-1 font-medium">{optionLabel(o)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{votesLabel(o.votes)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {isOwner ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Your poll. See who voted and pick a date from your dashboard.
        </p>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          disabled={picked.size === 0}
          variant={voted ? "outline" : "default"}
          className="mt-2 h-10 w-full rounded-xl font-semibold"
        >
          {voted ? (
            <>
              <Check /> Voted · update my vote
            </>
          ) : (
            "Vote for these dates"
          )}
        </Button>
      )}
      <PollVoteDrawer
        open={open}
        onOpenChange={setOpen}
        planId={planId}
        optionIds={[...picked]}
        labels={counts.filter((o) => picked.has(o.option_id)).map(optionLabel)}
        firstName={firstName}
        onVoted={() => {
          setVoted(true);
          void load();
        }}
      />
    </section>
  );
}

function PollVoteDrawer({
  open,
  onOpenChange,
  planId,
  optionIds,
  labels,
  firstName,
  onVoted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  optionIds: string[];
  labels: string[];
  firstName: string;
  onVoted: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { containerRef: turnstileRef, getToken: getTurnstileToken } = useTurnstile();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next && sent) setTimeout(() => setSent(false), 300);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !contact.trim()) {
      setError("Add your name and a way to reach you.");
      return;
    }
    setPending(true);
    try {
      const result = await submitPollVote({
        planId,
        optionIds,
        name,
        contact,
        website: trap,
        turnstileToken: await getTurnstileToken(),
      });
      if (!result.ok) {
        setError(submitErrorMessage(result.error, firstName));
        return;
      }
      setSent(true);
      onVoted();
    } catch (err) {
      console.error(err);
      setError("Couldn't send that — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 pt-10 pb-8 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <PartyPopper className="size-8" />
            </div>
            <DrawerTitle className="text-xl font-bold">Vote counted!</DrawerTitle>
            <DrawerDescription>{firstName} will see which dates work for you.</DrawerDescription>
            <Button className="mt-4 h-11 w-full rounded-xl" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="relative flex flex-col">
            <Honeypot value={trap} onChange={setTrap} />
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-bold">Vote for dates 🗓️</DrawerTitle>
              <DrawerDescription className="text-left">
                {labels.join(", ")}. Only {firstName} sees your name.
              </DrawerDescription>
            </DrawerHeader>
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="poll-name">Your name</Label>
                <Input
                  id="poll-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  autoComplete="name"
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="poll-contact">Instagram handle or WhatsApp / phone</Label>
                <Input
                  id="poll-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={60}
                  required
                  className="h-11 text-base"
                />
                <p className="text-xs text-muted-foreground">{CONTACT_HINT}</p>
              </div>
              <div ref={turnstileRef} />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DrawerFooter>
              <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl text-base font-semibold">
                {pending ? <Loader2 className="animate-spin" /> : "Send my vote"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
