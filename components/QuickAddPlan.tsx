"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PillGroup } from "@/components/PillGroup";
import { CATEGORY_ICONS, STATUS_STYLES } from "@/components/plan-meta";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  STATUSES,
  TIMEFRAMES,
  VISIBILITIES,
  effectiveTimeframe,
  type Category,
  type Plan,
  type PlanInput,
  type Status,
  type Timeframe,
  type Visibility,
  type Circle,
  type PlanPrivateDetails,
} from "@/lib/types";
import { localTimeZone, utcToZonedInput, zonedInputToUtc } from "@/lib/dates";
import { withCategory } from "@/lib/plan-form";
import { PLAN_TEMPLATES, applyTemplate, type PlanTemplate } from "@/lib/templates";

type QuickAddPlanProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** When set, the form edits this plan instead of creating a new one. */
  editing?: Plan | null;
  /** The owner's circles, for the "Circles" audience. */
  circles: Pick<Circle, "id" | "name">[];
  /** Circles the edited plan is currently shared with. */
  editingCircleIds?: string[];
  onSaved: (plan: Plan, circleIds: string[]) => void;
};

const EMPTY: PlanInput = {
  title: "",
  category: "Trip",
  timeframe: "This Month",
  status: "Just an Idea",
  specific_dates: "",
  start_date: "",
  end_date: "",
  dates_flexible: false,
  notes: "",
  visibility: "public",
  capacity: null,
  origin: "",
  destination: "",
  departs_at: null,
  departs_tz: null,
};

const VISIBILITY_LABELS: Record<Visibility, string> = { public: "Public", unlisted: "Unlisted", circles: "Circles" };

const VISIBILITY_HINTS: Record<Visibility, string> = {
  public: "Shown on your Radar page.",
  unlisted: "Hidden from your page. Only people with the plan's direct link can see it.",
  circles: "Only signed-in members of the circles you pick. Everyone else sees nothing, not even that it exists.",
};

export function QuickAddPlan({
  open,
  onOpenChange,
  userId,
  editing,
  circles,
  editingCircleIds,
  onSaved,
}: QuickAddPlanProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{editing ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>What&apos;s on your radar?</DialogDescription>
        </DialogHeader>
        {/* Keyed so the form state starts fresh for each plan / each open. */}
        <PlanForm
          key={editing?.id ?? "new"}
          userId={userId}
          editing={editing ?? null}
          circles={circles}
          initialCircleIds={editingCircleIds ?? []}
          onSaved={(plan, circleIds) => {
            onSaved(plan, circleIds);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({
  userId,
  editing,
  circles,
  initialCircleIds,
  onSaved,
}: {
  userId: string;
  editing: Plan | null;
  circles: Pick<Circle, "id" | "name">[];
  initialCircleIds: string[];
  onSaved: (plan: Plan, circleIds: string[]) => void;
}) {
  const [form, setForm] = useState<PlanInput>(() =>
    editing
      ? {
          title: editing.title,
          category: editing.category,
          timeframe: editing.timeframe,
          status: editing.status,
          specific_dates: editing.specific_dates ?? "",
          start_date: editing.start_date ?? "",
          end_date: editing.end_date ?? "",
          dates_flexible: editing.dates_flexible ?? false,
          notes: editing.notes ?? "",
          visibility: editing.visibility ?? "public",
          capacity: editing.capacity ?? null,
          origin: editing.origin ?? "",
          destination: editing.destination ?? "",
          departs_at: editing.departs_at,
          departs_tz: editing.departs_tz,
        }
      : EMPTY,
  );
  const [circleIds, setCircleIds] = useState<string[]>(initialCircleIds);
  // Carpool departure, as typed: a wall time in `tz` (the zone it was first entered in).
  const [tz] = useState(() => editing?.departs_tz ?? localTimeZone());
  const [departure, setDeparture] = useState(() =>
    editing?.departs_at && editing.departs_tz ? utcToZonedInput(editing.departs_at, editing.departs_tz) : "",
  );
  const [privateDetails, setPrivateDetails] = useState({ pickup: "", contact: "", note: "", loaded: !editing });
  const [confirmPublic, setConfirmPublic] = useState(!!editing && editing.category === "Carpool" && editing.visibility === "public");
  const isCarpool = form.category === "Carpool";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Older plans used free-text dates; keep that field only for them.
  const showLegacyDates = !!editing?.specific_dates && !editing.start_date;

  function set<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Editing a carpool: load its private pickup / contact (owner-only via RLS).
  const editingId = editing?.category === "Carpool" ? editing.id : null;
  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    createClient()
      .from("plan_private_details")
      .select("*")
      .eq("plan_id", editingId)
      .maybeSingle<PlanPrivateDetails>()
      .then(({ data }) => {
        if (!cancelled) {
          setPrivateDetails({
            pickup: data?.pickup_details ?? "",
            contact: data?.owner_contact ?? "",
            note: data?.rider_note ?? "",
            loaded: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  function setCategory(category: Category) {
    // Safety default (see withCategory): a new carpool starts shared with circles only.
    setForm((f) => withCategory(f, category, !editing));
  }

  // Fills fields only; nothing is saved until "Post plan". The category goes
  // through the same withCategory() rule as tapping a category pill.
  function pickTemplate(template: PlanTemplate) {
    setForm((f) => applyTemplate(f, template));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give your plan a title.");
      return;
    }
    if (isCarpool) {
      if (!form.origin?.trim() || !form.destination?.trim() || !departure || !form.capacity) {
        setError("A carpool needs From, To, the departure time and the number of seats.");
        return;
      }
      if (form.visibility === "public" && !confirmPublic) {
        setError("Tick the box to confirm posting this carpool publicly.");
        return;
      }
    }
    // A carpool is dated by its departure (in its own zone).
    const start = isCarpool ? departure.slice(0, 10) : form.start_date || null;
    const end = isCarpool ? null : start ? form.end_date || null : null;
    if (end && start && end < start) {
      setError("The end date is before the start date.");
      return;
    }
    const sharedWith = form.visibility === "circles" ? circleIds.filter((id) => circles.some((c) => c.id === id)) : [];
    if (form.visibility === "circles" && sharedWith.length === 0) {
      setError("Pick at least one circle.");
      return;
    }
    setPending(true);
    setError(null);

    const payload = {
      title: form.title.trim().slice(0, 80),
      category: form.category,
      timeframe: form.timeframe,
      status: form.status,
      start_date: start,
      end_date: end === start ? null : end,
      dates_flexible: isCarpool ? false : !!form.dates_flexible,
      // Real dates replace the old free-text dates.
      specific_dates: start ? null : form.specific_dates?.trim() || null,
      notes: form.notes?.trim() || null,
      visibility: form.visibility,
      capacity: form.capacity,
      origin: isCarpool ? form.origin?.trim() || null : null,
      destination: isCarpool ? form.destination?.trim() || null : null,
      departs_at: isCarpool ? zonedInputToUtc(departure, tz) : null,
      departs_tz: isCarpool ? tz : null,
      ...(isCarpool && start ? { timeframe: effectiveTimeframe({ start_date: start, timeframe: form.timeframe, created_at: "" }) } : {}),
    };

    const supabase = createClient();
    const query = editing
      ? supabase.from("plans").update(payload).eq("id", editing.id).select().single<Plan>()
      : supabase
          .from("plans")
          .insert({ ...payload, user_id: userId })
          .select()
          .single<Plan>();

    const { data, error } = await query;

    if (error || !data) {
      setPending(false);
      setError(
        error?.message.includes("capacity_below_approved")
          ? "More people are already approved than that. Take back some spots first."
          : (error?.message ?? "Couldn't save the plan."),
      );
      return;
    }

    // Visibility + circles in one transaction. Saving "circles" above first
    // means a failure here leaves the plan visible to you alone, never wider.
    const { error: audienceError } = await supabase.rpc("set_plan_audience", {
      p_plan_id: data.id,
      p_visibility: form.visibility,
      p_circle_ids: sharedWith,
    });
    if (audienceError) {
      setPending(false);
      console.error("set_plan_audience", audienceError);
      setError("Saved, but couldn't update who can see it. Try saving again.");
      return;
    }

    // Carpool pickup / contact live in their own owner-only table.
    const pickup = privateDetails.pickup.trim();
    const contact = privateDetails.contact.trim();
    const riderNote = privateDetails.note.trim().slice(0, 280);
    const details =
      isCarpool && (pickup || contact || riderNote)
        ? await supabase.from("plan_private_details").upsert({
            plan_id: data.id,
            owner_id: userId,
            pickup_details: pickup || null,
            owner_contact: contact || null,
            rider_note: riderNote || null,
            updated_at: new Date().toISOString(),
          })
        : editing
          ? await supabase.from("plan_private_details").delete().eq("plan_id", data.id)
          : { error: null };
    setPending(false);
    if (details.error) {
      console.error("plan_private_details", details.error);
      setError("Saved, but couldn't save the pickup details. Try saving again.");
      return;
    }

    toast.success(editing ? "Plan updated" : "Plan posted 🚀");
    onSaved(data, sharedWith);
  }

  function toggleCircle(id: string) {
    setCircleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!editing && (
        <div role="group" aria-label="Start from a template" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {PLAN_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTemplate(t)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <span aria-hidden>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="plan-title">Title</Label>
        <Input
          id="plan-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Zion National Park camping"
          maxLength={80}
          autoFocus
          required
          className="h-11 text-base"
        />
      </div>

      <PillGroup<Category>
        label="Category"
        options={CATEGORIES}
        value={form.category}
        onChange={setCategory}
        renderOption={(c) => {
          const Icon = CATEGORY_ICONS[c];
          return (
            <>
              <Icon className="size-3.5" /> {c}
            </>
          );
        }}
      />

      {isCarpool ? (
        <CarpoolFields
          origin={form.origin ?? ""}
          destination={form.destination ?? ""}
          departure={departure}
          tz={tz}
          seats={form.capacity}
          pickup={privateDetails.pickup}
          contact={privateDetails.contact}
          note={privateDetails.note}
          detailsLoaded={privateDetails.loaded}
          onChange={(change) => {
            if ("origin" in change) set("origin", change.origin ?? "");
            if ("destination" in change) set("destination", change.destination ?? "");
            if ("seats" in change) set("capacity", change.seats ?? null);
            if ("departure" in change) setDeparture(change.departure ?? "");
            if ("pickup" in change || "contact" in change || "note" in change) {
              setPrivateDetails((d) => ({ ...d, ...change }));
            }
          }}
        />
      ) : (
        <PillGroup<Timeframe>
          label="When"
          options={TIMEFRAMES}
          value={form.timeframe}
          onChange={(v) => set("timeframe", v)}
        />
      )}

      <PillGroup<Status>
        label="Status"
        options={STATUSES}
        value={form.status}
        onChange={(v) => set("status", v)}
        renderOption={(s) => (
          <>
            <span className={cn("size-1.5 rounded-full", STATUS_STYLES[s].dot)} /> {s}
          </>
        )}
      />

      <div className="space-y-1.5">
        <PillGroup<Visibility>
          label="Who can see it"
          options={VISIBILITIES}
          value={form.visibility}
          onChange={(v) => set("visibility", v)}
          renderOption={(v) => VISIBILITY_LABELS[v]}
        />
        <p className="text-xs text-muted-foreground">{VISIBILITY_HINTS[form.visibility]}</p>
        {isCarpool && form.visibility === "public" && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
            <input
              type="checkbox"
              checked={confirmPublic}
              onChange={(e) => setConfirmPublic(e.target.checked)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              Post this carpool publicly. Anyone can see the route and departure time (never the pickup spot or your
              contact).
            </span>
          </label>
        )}
        {form.visibility === "circles" &&
          (circles.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              You don&apos;t have any circles yet.{" "}
              <Link href="/settings" className="font-semibold underline underline-offset-2">
                Create one in Settings
              </Link>
            </p>
          ) : (
            <div role="group" aria-label="Circles" className="flex flex-wrap gap-1.5 pt-1">
              {circles.map((c) => {
                const checked = circleIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                      checked ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                    )}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleCircle(c.id)} className="sr-only" />
                    {checked && <Check className="size-3.5" />}
                    {c.name}
                  </label>
                );
              })}
            </div>
          ))}
      </div>

      {!isCarpool && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-start">
              Start <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="plan-start"
              type="date"
              value={form.start_date ?? ""}
              onChange={(e) => {
                const start = e.target.value;
                setForm((f) => ({
                  ...f,
                  start_date: start,
                  end_date: f.end_date && start && f.end_date < start ? "" : f.end_date,
                  // Picking a date puts the plan in the matching bucket.
                  timeframe: start ? effectiveTimeframe({ ...f, start_date: start, created_at: "" }) : f.timeframe,
                }));
              }}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-end">
              End <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="plan-end"
              type="date"
              value={form.end_date ?? ""}
              min={form.start_date || undefined}
              disabled={!form.start_date}
              onChange={(e) => set("end_date", e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <p className="col-span-2 -mt-1.5 text-xs text-muted-foreground">
            No dates yet? Leave these empty and the “When” bucket is used. Dated plans can be added to calendars.
          </p>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.dates_flexible}
              onChange={(e) => set("dates_flexible", e.target.checked)}
              className="size-4 accent-foreground"
            />
            Flexible on dates
          </label>
        </div>
      )}

      {!isCarpool && (
        <div className="space-y-1.5">
          <Label htmlFor="plan-capacity">
            Spots <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="plan-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={form.capacity ?? ""}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                set("capacity", Number.isNaN(n) ? null : Math.min(50, Math.max(1, n)));
              }}
              placeholder="No limit"
              className="h-11 w-28 text-base"
            />
            <p className="text-xs text-muted-foreground">
              {form.capacity
                ? `“I'm Interested” becomes “Request a spot”. You approve up to ${form.capacity}.`
                : "Set a number to approve who gets a spot."}
            </p>
          </div>
        </div>
      )}

      {showLegacyDates && !form.start_date && !isCarpool && (
        <div className="space-y-1.5">
          <Label htmlFor="plan-dates">Dates (text)</Label>
          <Input
            id="plan-dates"
            value={form.specific_dates ?? ""}
            onChange={(e) => set("specific_dates", e.target.value)}
            maxLength={40}
            className="h-11 text-base"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="plan-notes">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <span className="text-xs text-muted-foreground tabular-nums">{(form.notes ?? "").length}/140</span>
        </div>
        <Input
          id="plan-notes"
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Need 2 more for the campsite"
          maxLength={140}
          className="h-11 text-base"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl text-base font-semibold">
        {pending ? <Loader2 className="animate-spin" /> : editing ? "Save changes" : "Post plan"}
      </Button>
    </form>
  );
}

type CarpoolChange = Partial<{
  origin: string;
  destination: string;
  departure: string;
  seats: number | null;
  pickup: string;
  contact: string;
  note: string;
}>;

/** Route, departure and seats (public to whoever sees the plan) + pickup and contact (approved riders only). */
function CarpoolFields({
  origin,
  destination,
  departure,
  tz,
  seats,
  pickup,
  contact,
  note,
  detailsLoaded,
  onChange,
}: {
  origin: string;
  destination: string;
  departure: string;
  tz: string;
  seats: number | null;
  pickup: string;
  contact: string;
  note: string;
  detailsLoaded: boolean;
  onChange: (change: CarpoolChange) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="carpool-from">From</Label>
          <Input
            id="carpool-from"
            value={origin}
            onChange={(e) => onChange({ origin: e.target.value })}
            placeholder="SF Mission"
            maxLength={60}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="carpool-to">To</Label>
          <Input
            id="carpool-to"
            value={destination}
            onChange={(e) => onChange({ destination: e.target.value })}
            placeholder="Tahoe"
            maxLength={60}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="carpool-departure">Departure</Label>
          <Input
            id="carpool-departure"
            type="datetime-local"
            value={departure}
            onChange={(e) => onChange({ departure: e.target.value })}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="carpool-seats">Seats</Label>
          <Input
            id="carpool-seats"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={seats ?? ""}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              onChange({ seats: Number.isNaN(n) ? null : Math.min(50, Math.max(1, n)) });
            }}
            placeholder="3"
            className="h-11 text-base"
          />
        </div>
        <p className="col-span-2 -mt-1.5 text-xs text-muted-foreground">
          Time is in {tz.replace(/_/g, " ")}. Riders request a seat and you approve them.
        </p>
      </div>

      <div className="space-y-3 border-t pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Lock className="size-3.5" /> Only approved riders see these
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="carpool-pickup">Exact pickup</Label>
          <Input
            id="carpool-pickup"
            value={pickup}
            onChange={(e) => onChange({ pickup: e.target.value })}
            placeholder={detailsLoaded ? "24th St BART, north exit" : "Loading…"}
            disabled={!detailsLoaded}
            maxLength={280}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="carpool-contact">Your contact</Label>
          <Input
            id="carpool-contact"
            value={contact}
            onChange={(e) => onChange({ contact: e.target.value })}
            placeholder={detailsLoaded ? "@you or +1 555 123 4567" : "Loading…"}
            disabled={!detailsLoaded}
            maxLength={60}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="carpool-note">
              Note to riders <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">{note.length}/280</span>
          </div>
          <Textarea
            id="carpool-note"
            value={note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder={detailsLoaded ? "Bring snow chains. Leaving 10 min early if traffic." : "Loading…"}
            disabled={!detailsLoaded}
            maxLength={280}
            rows={2}
            className="text-base"
          />
        </div>
      </div>
    </div>
  );
}
