"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImageDown,
  Link2,
  Lightbulb,
  LogOut,
  Pencil,
  Plus,
  Radar as RadarIcon,
  Settings,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { CategoryLabel, ChainPill, STATUS_STYLES } from "@/components/plan-meta";
import { PitchesDrawer } from "@/components/PitchesDrawer";
import { QuickAddPlan } from "@/components/QuickAddPlan";
import { LeadsDrawer } from "@/components/LeadsDrawer";
import { MonthView } from "@/components/MonthView";
import { JoinNotices } from "@/components/JoinNotices";
import { ViewAsDrawer, type ViewAsMember } from "@/components/ViewAsDrawer";
import { StoryExportModal } from "@/components/StoryExportModal";
import { copyText } from "@/components/ShareButton";
import { useOrigin } from "@/hooks/use-origin";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDateRange } from "@/lib/dates";
import { STATUSES, sortPlans, type BlockResult, type Circle, type JoinNotice, type Pitch, type Plan, type PlanWithCount, type Profile, type Status } from "@/lib/types";

type DashboardClientProps = {
  profile: Profile;
  initialPlans: PlanWithCount[];
  initialPitches: Pitch[];
  initialJoinNotices: JoinNotice[];
  circles: Pick<Circle, "id" | "name">[];
  /** plan id -> circle ids it's shared with */
  initialAudiences: Record<string, string[]>;
  viewAsMembers: ViewAsMember[];
};

export function DashboardClient({
  profile,
  initialPlans,
  initialPitches,
  initialJoinNotices,
  circles,
  initialAudiences,
  viewAsMembers,
}: DashboardClientProps) {
  const [plans, setPlans] = useState<PlanWithCount[]>(initialPlans);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [leadsPlan, setLeadsPlan] = useState<Plan | null>(null);
  // Bumped on every open so search/selection start fresh (without remounting on close).
  const [leadsKey, setLeadsKey] = useState(0);
  const [storyOpen, setStoryOpen] = useState(false);
  const [pitches, setPitches] = useState<Pitch[]>(initialPitches);
  const [pitchesOpen, setPitchesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"list" | "month">("list");
  const [audiences, setAudiences] = useState(initialAudiences);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const circleNames = (planId: string) =>
    (audiences[planId] ?? []).map((id) => circles.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  const origin = useOrigin();

  const publicPath = `/${profile.username}`;
  const shortLink = origin ? `${origin.replace(/^https?:\/\//, "")}${publicPath}` : publicPath;

  const active = sortPlans(plans.filter((p) => !p.is_archived));
  const archived = plans.filter((p) => p.is_archived);
  const totalInterested = active.reduce((n, p) => n + p.interest_count, 0);

  async function copyBioLink() {
    if (await copyText(`${window.location.origin}${publicPath}`)) {
      setCopied(true);
      toast.success("Bio link copied — paste it in your Instagram bio");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy the link");
    }
  }

  async function copyPlanLink(plan: Plan) {
    const url = `${window.location.origin}${publicPath}/p/${plan.id}`;
    if (await copyText(url)) {
      toast.success(
        plan.visibility === "unlisted"
          ? "Private link copied — only people with it can see this plan"
          : plan.visibility === "circles"
            ? `Link copied — only members of ${circleNames(plan.id).join(", ") || "its circles"} can open it`
            : "Plan link copied",
      );
    } else {
      toast.error("Couldn't copy the link");
    }
  }

  function openNew() {
    setEditing(null);
    setComposerOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setComposerOpen(true);
  }

  function onSaved(saved: Plan, circleIds: string[] = []) {
    setAudiences((a) => ({ ...a, [saved.id]: circleIds }));
    setPlans((prev) => {
      const existing = prev.find((p) => p.id === saved.id);
      return existing
        ? prev.map((p) => (p.id === saved.id ? { ...saved, interest_count: p.interest_count } : p))
        : [{ ...saved, interest_count: 0 }, ...prev];
    });
  }

  async function patchPlan(id: string, patch: Partial<Pick<Plan, "status" | "is_archived">>, successMsg?: string) {
    const prev = plans;
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await createClient().from("plans").update(patch).eq("id", id);
    if (error) {
      setPlans(prev);
      toast.error("Couldn't update the plan");
    } else if (successMsg) {
      toast.success(successMsg);
    }
  }

  async function deletePlan(id: string) {
    const prev = plans;
    setPlans((ps) => ps.filter((p) => p.id !== id));
    const { error } = await createClient().from("plans").delete().eq("id", id);
    if (error) {
      setPlans(prev);
      toast.error("Couldn't delete the plan");
    } else {
      toast.success("Plan deleted");
    }
  }

  const onCountChange = useCallback((planId: string, count: number) => {
    setPlans((ps) => ps.map((p) => (p.id === planId && p.interest_count !== count ? { ...p, interest_count: count } : p)));
  }, []);

  /** Blocking a sender clears their pitches and their interests on every plan. */
  function onBlocked({ pitch_ids, interests }: BlockResult) {
    setPitches((ps) => ps.filter((p) => !pitch_ids.includes(p.id)));
    const removedPerPlan = new Map<string, number>();
    interests.forEach((i) => removedPerPlan.set(i.plan_id, (removedPerPlan.get(i.plan_id) ?? 0) + 1));
    setPlans((ps) =>
      ps.map((p) =>
        removedPerPlan.has(p.id)
          ? { ...p, interest_count: Math.max(0, p.interest_count - removedPerPlan.get(p.id)!) }
          : p,
      ),
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-28">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
          <RadarIcon className="size-5 text-primary" /> Radar
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant={pitches.length > 0 ? "default" : "ghost"}
            size="sm"
            onClick={() => setPitchesOpen(true)}
            className={cn("rounded-full", pitches.length === 0 && "text-muted-foreground")}
            aria-label={`Friend pitches: ${pitches.length} pending`}
          >
            <Lightbulb />
            Pitches
            {pitches.length > 0 && (
              <span className="ml-0.5 rounded-full bg-primary-foreground px-1.5 text-[11px] leading-4 font-bold text-primary tabular-nums">
                {pitches.length}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/settings" />}
            nativeButton={false}
            className="text-muted-foreground"
            aria-label="Settings"
          >
            <Settings />
          </Button>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </header>

      <JoinNotices initialNotices={initialJoinNotices} />

      {/* Profile + top bar */}
      <section className="tap-card mt-4 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={profile.display_name} src={profile.avatar_url} className="ring-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{profile.display_name}</p>
            <p className="truncate text-sm text-muted-foreground">{shortLink}</p>
            <button
              type="button"
              onClick={() => setViewAsOpen(true)}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-foreground/80 underline-offset-2 hover:underline"
            >
              <Eye className="size-3" /> View as…
            </button>
          </div>
          <div className="text-right">
            <p className="text-2xl leading-none font-bold tabular-nums">{totalInterested}</p>
            <p className="text-xs text-muted-foreground">interested</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button onClick={copyBioLink} className="h-auto flex-col gap-1 rounded-xl py-2.5 text-xs">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied!" : "Copy Bio Link"}
          </Button>
          <Button
            variant="outline"
            render={<Link href={publicPath} target="_blank" rel="noopener" />}
            nativeButton={false}
            className="h-auto flex-col gap-1 rounded-xl py-2.5 text-xs"
          >
            <ExternalLink />
            Preview Page
          </Button>
          <Button
            variant="outline"
            onClick={() => setStoryOpen(true)}
            className="h-auto flex-col gap-1 rounded-xl py-2.5 text-xs"
          >
            <ImageDown />
            Story Card
          </Button>
        </div>
      </section>

      {/* Quick add */}
      <button
        type="button"
        onClick={openNew}
        className="mt-5 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/10"
      >
        <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
          <Plus className="size-5" />
        </span>
        <span>
          <span className="block font-semibold">Add a plan</span>
          <span className="block text-sm text-muted-foreground">Trip, concert, hike… takes 15 seconds</span>
        </span>
      </button>

      {/* Active plans */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
            On your radar · {active.length}
          </h2>
          <div role="radiogroup" aria-label="View" className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
            {(["list", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 capitalize transition-colors",
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {view === "month" ? (
          <MonthView plans={active} onSelect={openEdit} />
        ) : active.length === 0 ? (
          <div className="tap-card px-6 py-10 text-center">
            <p className="text-3xl">🛰️</p>
            <p className="mt-3 font-semibold">Your radar is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Post your first plan so friends can call dibs before you book.
            </p>
            <Button onClick={openNew} className="mt-4 rounded-full">
              <Plus /> Add your first plan
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {active.map((plan) => (
              <ManagePlanRow
                key={plan.id}
                plan={plan}
                onStatus={(status) => patchPlan(plan.id, { status })}
                onEdit={() => openEdit(plan)}
                onArchive={() => patchPlan(plan.id, { is_archived: true }, "Archived — hidden from your page")}
                onDelete={() => deletePlan(plan.id)}
                onLeads={() => {
                  setLeadsKey((k) => k + 1);
                  setLeadsPlan(plan);
                }}
                onCopyLink={() => copyPlanLink(plan)}
                circleNames={circleNames(plan.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Archived */}
      {archived.length > 0 && (
        <details className="group mt-8">
          <summary className="cursor-pointer list-none text-xs font-bold tracking-widest text-muted-foreground uppercase">
            Archived · {archived.length} <span className="group-open:hidden">(show)</span>
          </summary>
          <ul className="mt-3 space-y-2">
            {archived.map((plan) => (
              <li key={plan.id} className="flex items-center gap-3 rounded-xl border bg-card/50 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{plan.title}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patchPlan(plan.id, { is_archived: false }, "Restored")}
                >
                  <ArchiveRestore /> Restore
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => deletePlan(plan.id)} aria-label="Delete">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Floating add button (mobile) */}
      <Button
        onClick={openNew}
        size="icon-lg"
        className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] size-14 rounded-full shadow-lg shadow-primary/30 sm:hidden"
        aria-label="Add a plan"
      >
        <Plus className="size-6" />
      </Button>

      <QuickAddPlan
        open={composerOpen}
        onOpenChange={setComposerOpen}
        userId={profile.id}
        editing={editing}
        circles={circles}
        editingCircleIds={editing ? (audiences[editing.id] ?? []) : []}
        onSaved={onSaved}
      />
      <PitchesDrawer
        open={pitchesOpen}
        onOpenChange={setPitchesOpen}
        pitches={pitches}
        onResolved={(ids) => setPitches((ps) => ps.filter((p) => !ids.includes(p.id)))}
        onPlanAdded={onSaved}
        onBlocked={onBlocked}
      />
      <LeadsDrawer
        key={leadsKey}
        plan={leadsPlan}
        onOpenChange={(o) => !o && setLeadsPlan(null)}
        onCountChange={onCountChange}
        onBlocked={onBlocked}
      />
      <ViewAsDrawer
        open={viewAsOpen}
        onOpenChange={setViewAsOpen}
        hostName={profile.display_name}
        hostUsername={profile.username}
        members={viewAsMembers}
        circles={circles}
        audiences={audiences}
      />
      <StoryExportModal open={storyOpen} onOpenChange={setStoryOpen} profile={profile} plans={plans} />
    </main>
  );
}

type ManagePlanRowProps = {
  plan: PlanWithCount;
  onStatus: (status: Status) => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onLeads: () => void;
  onCopyLink: () => void;
  circleNames: string[];
};

function ManagePlanRow({
  plan,
  onStatus,
  onEdit,
  onArchive,
  onDelete,
  onLeads,
  onCopyLink,
  circleNames,
}: ManagePlanRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  return (
    <li className="tap-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CategoryLabel category={plan.category} />
          <p className="mt-1 leading-snug font-bold">{plan.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3" />
            {plan.start_date
              ? formatDateRange(plan.start_date, plan.end_date)
              : `${plan.timeframe}${plan.specific_dates ? ` · ${plan.specific_dates}` : ""}`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {plan.visibility === "circles" && (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                <UsersRound className="size-3 shrink-0" />
                {circleNames.length ? circleNames.join(", ") : "No circles — only you"}
              </span>
            )}
            {plan.visibility === "unlisted" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                <EyeOff className="size-3" /> Unlisted
              </span>
            )}
            <ChainPill plan={plan} />
          </div>
        </div>
        <button
          type="button"
          onClick={onLeads}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
            plan.interest_count > 0
              ? "bg-primary text-primary-foreground hover:bg-primary/85"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          )}
          aria-label={`${plan.interest_count} interested — view`}
        >
          <Users className="size-4" />
          <span className="tabular-nums">{plan.interest_count}</span>
        </button>
      </div>

      {/* One-tap status toggle */}
      <div role="radiogroup" aria-label="Status" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {STATUSES.map((status) => {
          const selected = plan.status === status;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => !selected && onStatus(status)}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all",
                selected ? cn("ring-1 ring-inset", STATUS_STYLES[status].pill) : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected && <span className={cn("size-1.5 rounded-full", STATUS_STYLES[status].dot)} />}
              {status}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onCopyLink} aria-label="Copy plan link">
          <Link2 /> Link
        </Button>
        <Button variant="ghost" size="sm" onClick={onArchive}>
          <Archive /> Archive
        </Button>
        <Button
          variant={confirmDelete ? "destructive" : "ghost"}
          size="sm"
          className="ml-auto"
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
        >
          <Trash2 /> {confirmDelete ? "Tap to confirm" : "Delete"}
        </Button>
      </div>
    </li>
  );
}
