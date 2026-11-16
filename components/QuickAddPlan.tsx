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
  type Category,
  type Plan,
  type PlanInput,
  type Status,
  type Timeframe,
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
  notes: "",
};

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
          notes: editing.notes ?? "",
        }
      : EMPTY,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give your plan a title.");
      return;
    }
    setPending(true);
    setError(null);

    const payload = {
      title: form.title.trim().slice(0, 80),
      category: form.category,
      timeframe: form.timeframe,
      status: form.status,
      specific_dates: form.specific_dates?.trim() || null,
      notes: form.notes?.trim() || null,
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

      <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
        <div className="space-y-1.5">
          <Label htmlFor="plan-dates">
            Dates <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="plan-dates"
            value={form.specific_dates ?? ""}
            onChange={(e) => set("specific_dates", e.target.value)}
            placeholder="Oct 12–15"
            maxLength={40}
            className="h-11 text-base"
          />
        </div>
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
