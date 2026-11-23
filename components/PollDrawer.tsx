"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarPlus, Check, Loader2, Trash2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactChip } from "@/components/ContactChip";
import { useTapToConfirm } from "@/hooks/use-tap-to-confirm";
import { createClient } from "@/lib/supabase/client";
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  newOptionProblem,
  optionLabel,
  countingBallots,
  sortOptions,
  tallyBallots,
  votesLabel,
  type PollBallot,
  type PollOption,
} from "@/lib/polls";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";

type PollData = { options: PollOption[]; ballots: PollBallot[]; stale: Set<string> };

async function fetchPoll(id: string): Promise<PollData> {
  const supabase = createClient();
  const [{ data: options, error: oErr }, { data: ballots, error: bErr }, { data: stale, error: sErr }] = await Promise.all([
    supabase
      .from("plan_date_options")
      .select("id, plan_id, start_date, end_date")
      .eq("plan_id", id)
      .returns<PollOption[]>(),
    supabase
      .from("plan_poll_ballots")
      .select("id, voter_name, voter_contact, user_id, created_at, plan_poll_choices(option_id)")
      .eq("plan_id", id)
      .order("created_at")
      .returns<BallotDbRow[]>(),
    // Ballots from people who can no longer see the plan (owner only).
    supabase.rpc("poll_stale_ballots", { p_plan_id: id }),
  ]);
  if (oErr || bErr || sErr) {
    console.error("poll load", oErr ?? bErr ?? sErr);
    toast.error("Couldn't load the poll");
  }
  const parsed = (ballots ?? []).map(({ plan_poll_choices, ...b }) => ({
    ...b,
    option_ids: plan_poll_choices.map((c) => c.option_id),
  }));
  return { options: options ?? [], ballots: parsed, stale: new Set((stale as string[] | null) ?? []) };
}

type BallotDbRow = Omit<PollBallot, "option_ids"> & {
  plan_poll_choices: { option_id: string }[];
};

const ERRORS: Record<string, string> = {
  poll_full: `Up to ${POLL_MAX_OPTIONS} options.`,
  poll_closed: "You've already picked the dates.",
  poll_needs_idea: "Date polls are for plans that are still “Just an Idea”.",
};

/**
 * The owner's date poll for one plan: add/remove 2–4 options, see votes and
 * who voted (RLS gives the owner every ballot), and pick one. Picking sets the
 * plan's dates, closes the poll, and offers to move it to Booking Soon.
 */
export function PollDrawer({
  plan,
  onOpenChange,
  onCounts,
  onPicked,
  onBookingSoon,
}: {
  plan: Plan | null;
  onOpenChange: (open: boolean) => void;
  /** Options / voters changed, for the dashboard card. */
  onCounts: (planId: string, counts: { options: number; votes: number }) => void;
  onPicked: (plan: Plan) => void;
  onBookingSoon: (planId: string) => void;
}) {
  const planId = plan?.id;
  const [data, setData] = useState<(PollData & { planId: string }) | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [justPicked, setJustPicked] = useState<string | null>(null);
  const current = data && data.planId === planId ? data : null;
  const closed = !!plan?.poll_closed_at;

  const apply = useCallback(
    (id: string, loaded: PollData) => {
      setData({ planId: id, ...loaded });
      onCounts(id, {
        options: loaded.options.length,
        votes: countingBallots(loaded.ballots, loaded.stale),
      });
    },
    [onCounts],
  );
  const load = useCallback(async (id: string) => apply(id, await fetchPoll(id)), [apply]);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    fetchPoll(planId).then((loaded) => {
      if (!cancelled) apply(planId, loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [planId, apply]);

  const problem = current ? newOptionProblem(current.options, start, end) : null;
  const rows = current ? tallyBallots(current.options, current.ballots, current.stale) : [];
  const counting = current ? countingBallots(current.ballots, current.stale) : 0;

  async function removeBallot(id: string) {
    if (!plan) return;
    const { error } = await createClient().from("plan_poll_ballots").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't remove that vote");
      return;
    }
    toast.success("Vote removed");
    await load(plan.id);
  }

  async function addOption(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || problem) return;
    setBusy(true);
    const { error } = await createClient()
      .from("plan_date_options")
      .insert({
        plan_id: plan.id,
        owner_id: plan.user_id,
        start_date: start,
        end_date: end && end !== start ? end : null,
      });
    setBusy(false);
    if (error) {
      toast.error(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? "Couldn't add that date");
      return;
    }
    setStart("");
    setEnd("");
    await load(plan.id);
  }

  async function removeOption(id: string) {
    if (!plan) return;
    const { error } = await createClient().from("plan_date_options").delete().eq("id", id);
    if (error)
      toast.error(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? "Couldn't remove that date");
    await load(plan.id);
  }

  async function pick(option: PollOption) {
    setBusy(true);
    const { data: updated, error } = await createClient().rpc("pick_date_option", { p_option_id: option.id });
    setBusy(false);
    if (error || !updated) {
      toast.error(error?.message.includes("poll_closed") ? ERRORS.poll_closed : "Couldn't pick that date");
      return;
    }
    onPicked(updated as Plan);
    setJustPicked(optionLabel(option));
  }

  return (
    <Drawer
      open={!!plan}
      onOpenChange={(o) => {
        if (!o) setJustPicked(null);
        onOpenChange(o);
      }}
    >
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-lg font-bold">
            <CalendarCheck className="size-5 text-primary" /> Date poll
          </DrawerTitle>
          <DrawerDescription className="text-left">
            {plan?.title}
            {current && ` · ${counting} ${counting === 1 ? "person" : "people"} voted`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pt-0">
          {justPicked && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="font-semibold">Dates set: {justPicked}. The poll is closed.</p>
              <p className="mt-0.5 text-muted-foreground">
                Move the plan to Booking Soon so friends know it&apos;s happening?
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (plan) onBookingSoon(plan.id);
                    setJustPicked(null);
                    onOpenChange(false);
                  }}
                >
                  Move to Booking Soon
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setJustPicked(null)}>
                  Not yet
                </Button>
              </div>
            </div>
          )}

          {!current ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : (
            <>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Offer {POLL_MIN_OPTIONS}–{POLL_MAX_OPTIONS} date options. Anyone who can see this plan can vote for
                  the ones that work.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map(({ option, votes, voters, leading }) => {
                    const isPicked = plan?.poll_picked_option_id === option.id;
                    return (
                      <li
                        key={option.id}
                        className={cn(
                          "rounded-xl border px-3 py-2.5",
                          (leading || isPicked) && "border-primary/40 bg-primary/5",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <p className="flex-1 font-semibold">
                            {optionLabel(option)}
                            {isPicked && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px align-middle text-[10px] font-bold text-emerald-800 uppercase dark:bg-emerald-500/15 dark:text-emerald-300">
                                <Check className="size-2.5" /> Picked
                              </span>
                            )}
                            {!isPicked && leading && (
                              <Trophy className="ml-1.5 inline size-3.5 text-amber-500" aria-label="most votes" />
                            )}
                          </p>
                          <span className="text-xs text-muted-foreground tabular-nums">{votesLabel(votes)}</span>
                          {!closed && (
                            <button
                              type="button"
                              onClick={() => removeOption(option.id)}
                              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                              aria-label={`Remove ${optionLabel(option)}`}
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                        {voters.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {voters.map((v, i) => (
                              <span key={`${v.name}-${i}`} className={cn(v.stale && "line-through decoration-muted-foreground/50")}>
                                {i > 0 && ", "}
                                {v.name}
                              </span>
                            ))}
                          </p>
                        )}
                        {!closed && current.options.length >= POLL_MIN_OPTIONS && (
                          <Button
                            size="sm"
                            variant={leading ? "default" : "outline"}
                            className="mt-2 h-8"
                            disabled={busy}
                            onClick={() => pick(option)}
                          >
                            Pick this one
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {!closed && current.options.length < POLL_MAX_OPTIONS && (
                <form onSubmit={addOption} className="rounded-xl border border-dashed p-3">
                  <p className="text-sm font-semibold">Add a date option</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="poll-start" className="text-xs">
                        From
                      </Label>
                      <Input
                        id="poll-start"
                        type="date"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="poll-end" className="text-xs">
                        To (optional)
                      </Label>
                      <Input
                        id="poll-end"
                        type="date"
                        value={end}
                        min={start || undefined}
                        onChange={(e) => setEnd(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  </div>
                  {start && problem && <p className="mt-1.5 text-xs text-destructive">{problem}</p>}
                  <Button type="submit" size="sm" className="mt-2" disabled={busy || !start || !!problem}>
                    {busy ? <Loader2 className="animate-spin" /> : <CalendarPlus />} Add option
                  </Button>
                  {current.options.length < POLL_MIN_OPTIONS && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      The poll shows on your plan once it has {POLL_MIN_OPTIONS} options.
                    </p>
                  )}
                </form>
              )}

              {current.ballots.length > 0 && (
                <section aria-label="Who voted">
                  <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Who voted</h3>
                  <ul className="mt-2 divide-y rounded-xl border">
                    {current.ballots.map((b) => (
                      <BallotRow
                        key={b.id}
                        ballot={b}
                        stale={current.stale.has(b.id)}
                        labels={sortOptions(current.options.filter((o) => b.option_ids.includes(o.id))).map(optionLabel)}
                        onRemove={() => removeBallot(b.id)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** One voter, for the owner. Removing needs a second tap. */
function BallotRow({
  ballot,
  stale,
  labels,
  onRemove,
}: {
  ballot: PollBallot;
  stale: boolean;
  labels: string[];
  onRemove: () => void;
}) {
  const [armed, requestRemove] = useTapToConfirm(onRemove);
  return (
    <li className="flex items-start gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={cn("flex flex-wrap items-center gap-1.5 text-sm font-semibold", stale && "text-muted-foreground")}>
          {ballot.voter_name}
          <ContactChip contact={ballot.voter_contact} />
          {stale && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              No longer in this circle · not counted
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{labels.join(", ") || "No dates left"}</p>
      </div>
      <Button
        size="sm"
        variant={armed ? "destructive" : "ghost"}
        onClick={requestRemove}
        className="h-8 shrink-0"
        aria-label={armed ? `Tap again to remove ${ballot.voter_name}'s vote` : `Remove ${ballot.voter_name}'s vote`}
      >
        <Trash2 /> {armed ? "Tap to confirm" : "Remove"}
      </Button>
    </li>
  );
}
