"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
} from "@/lib/types";

type QuickAddPlanProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** When set, the form edits this plan instead of creating a new one. */
  editing?: Plan | null;
  onSaved: (plan: Plan) => void;
};

const EMPTY: PlanInput = {
  title: "",
  category: "Trip",
  timeframe: "This Month",
  status: "Just an Idea",
  specific_dates: "",
  start_date: "",
  end_date: "",
  notes: "",
  visibility: "public",
};

const VISIBILITY_LABELS: Record<Visibility, string> = { public: "Public", unlisted: "Unlisted" };

export function QuickAddPlan({ open, onOpenChange, userId, editing, onSaved }: QuickAddPlanProps) {
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
          onSaved={(plan) => {
            onSaved(plan);
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
  onSaved,
}: {
  userId: string;
  editing: Plan | null;
  onSaved: (plan: Plan) => void;
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
          notes: editing.notes ?? "",
          visibility: editing.visibility ?? "public",
        }
      : EMPTY,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Older plans used free-text dates; keep that field only for them.
  const showLegacyDates = !!editing?.specific_dates && !editing.start_date;

  function set<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give your plan a title.");
      return;
    }
    const start = form.start_date || null;
    const end = start ? form.end_date || null : null;
    if (end && start && end < start) {
      setError("The end date is before the start date.");
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
      // Real dates replace the old free-text dates.
      specific_dates: start ? null : form.specific_dates?.trim() || null,
      notes: form.notes?.trim() || null,
      visibility: form.visibility,
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
    setPending(false);

    if (error || !data) {
      setError(error?.message ?? "Couldn't save the plan.");
      return;
    }
    toast.success(editing ? "Plan updated" : "Plan posted 🚀");
    onSaved(data);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
        onChange={(v) => set("category", v)}
        renderOption={(c) => {
          const Icon = CATEGORY_ICONS[c];
          return (
            <>
              <Icon className="size-3.5" /> {c}
            </>
          );
        }}
      />

      <PillGroup<Timeframe>
        label="When"
        options={TIMEFRAMES}
        value={form.timeframe}
        onChange={(v) => set("timeframe", v)}
      />

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
        <p className="text-xs text-muted-foreground">
          {form.visibility === "public"
            ? "Shown on your Radar page."
            : "Hidden from your page. Only people with the plan's direct link can see it."}
        </p>
      </div>

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
      </div>

      {showLegacyDates && !form.start_date && (
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
