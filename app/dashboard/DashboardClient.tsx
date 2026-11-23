"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  CalendarCheck,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImageDown,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Lightbulb,
  Pencil,
  Plus,
  Radar as RadarIcon,
  Share2,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { CATEGORY_ICONS, ChainPill, STATUS_STYLES } from "@/components/plan-meta";
import { Menu, MenuContent, MenuSeparator, menuItemClass } from "@/components/ui/menu";
import { PitchesDrawer } from "@/components/PitchesDrawer";
import { QuickAddPlan } from "@/components/QuickAddPlan";
import { LeadsDrawer } from "@/components/LeadsDrawer";
import { MonthView } from "@/components/MonthView";
import { JoinNotices } from "@/components/JoinNotices";
import { PromotionNotices } from "@/components/PromotionNotices";
import { ViewAsDrawer, type ViewAsMember } from "@/components/ViewAsDrawer";
import { AccountMenu } from "@/components/AccountMenu";
import { InterestOverviewDrawer } from "@/components/InterestOverviewDrawer";
import { PollDrawer } from "@/components/PollDrawer";
import { StoryExportModal } from "@/components/StoryExportModal";
import { copyText } from "@/components/ShareButton";
import { useOrigin } from "@/hooks/use-origin";
import { useLocalToday, type LocalToday } from "@/hooks/use-local-today";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDeparture } from "@/lib/dates";
import { planWhen, sortByWhen } from "@/lib/plan-when";
import { STATUSES, commitmentSummary, type BlockResult, type CircleOption, countLeads, type LeadCounts, type JoinNotice, type Pitch, type Plan, type PlanWithCount, type Profile, type Status } from "@/lib/types";

type DashboardClientProps = {
  profile: Profile;
  initialPlans: PlanWithCount[];
  initialPitches: Pitch[];
  initialJoinNotices: JoinNotice[];
  circles: CircleOption[];
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
  const [interestOpen, setInterestOpen] = useState(false);
  const [pollPlanId, setPollPlanId] = useState<string | null>(null);
  const pollPlan = plans.find((p) => p.id === pollPlanId) ?? null;
  const onPollCounts = useCallback((planId: string, c: { options: number; votes: number }) => {
    setPlans((ps) => ps.map((p) => (p.id === planId ? { ...p, poll_option_count: c.options, poll_vote_count: c.votes } : p)));
  }, []);
  const [showArchived, setShowArchived] = useState(false);
  const circleNames = (planId: string) =>
    (audiences[planId] ?? []).map((id) => circles.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  const origin = useOrigin();

  const publicPath = `/${profile.username}`;
  const shortLink = origin ? `${origin.replace(/^https?:\/\//, "")}${publicPath}` : publicPath;

  const localToday = useLocalToday();
  const active = sortByWhen(
    plans.filter((p) => !p.is_archived),
    localToday.today,
    localToday.timeZone,
  );
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

  /** Friends who open a public plan can "Copy to my Radar", which chains their copy to it. */
  async function copyChainLink(plan: Plan) {
    const url = `${window.location.origin}${publicPath}/p/${plan.id}`;
    if (await copyText(url)) {
      toast.success("Link copied — send it to a friend", {
        description: "When they tap “Copy to my Radar”, their plan is chained to yours.",
      });
    } else {
      toast.error("Couldn't copy the link");
    }
  }

  function openLeads(plan: Plan) {
    setLeadsKey((k) => k + 1);
    setLeadsPlan(plan);
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
        ? prev.map((p) =>
            p.id === saved.id
              ? {
                  ...saved,
                  interest_count: p.interest_count,
                  maybe_count: p.maybe_count,
                  approved_count: p.approved_count,
                  pending_count: p.pending_count,
                  poll_option_count: p.poll_option_count,
                  poll_vote_count: p.poll_vote_count,
                }
              : p,
          )
        : [
            { ...saved, interest_count: 0, maybe_count: 0, approved_count: 0, pending_count: 0, poll_option_count: 0, poll_vote_count: 0 },
            ...prev,
          ];
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

  const onCountChange = useCallback((planId: string, counts: LeadCounts) => {
    setPlans((ps) => ps.map((p) => (p.id === planId ? { ...p, ...counts } : p)));
  }, []);

  /** Blocking a sender clears their pitches and their interests on every plan. */
  function onBlocked({ pitch_ids, interests }: BlockResult) {
    setPitches((ps) => ps.filter((p) => !pitch_ids.includes(p.id)));
    setPlans((ps) =>
      ps.map((p) => {
        const removed = interests.filter((i) => i.plan_id === p.id);
        if (removed.length === 0) return p;
        const by = countLeads(removed);
        return {
          ...p,
          interest_count: Math.max(0, p.interest_count - by.interest_count),
          maybe_count: Math.max(0, p.maybe_count - by.maybe_count),
          approved_count: Math.max(0, p.approved_count - by.approved_count),
          pending_count: Math.max(0, p.pending_count - by.pending_count),
        };
      }),
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-28 lg:max-w-5xl">
      {/* Header */}
      <header className="-mx-4 flex items-center justify-between gap-3 border-b px-4 pb-3">
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
          <AccountMenu profile={profile} />
        </div>
      </header>

      <JoinNotices initialNotices={initialJoinNotices} />
      {/* Your own requests on other people's plans that moved off a waitlist. */}
      <PromotionNotices viewerId={profile.id} className="mt-4" />

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
          <button
            type="button"
            onClick={() => setInterestOpen(true)}
            className="-my-1 -mr-1 rounded-xl px-2 py-1 text-right transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`${totalInterested} interested — see who`}
          >
            <p className="text-2xl leading-none font-bold tabular-nums">{totalInterested}</p>
            <p className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
              interested <ChevronRight className="size-3" aria-hidden />
            </p>
          </button>
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
          <ul className="grid gap-3 lg:grid-cols-2">
            {active.map((plan) => (
              <ManagePlanRow
                key={plan.id}
                plan={plan}
                onStatus={(status) => patchPlan(plan.id, { status })}
                onEdit={() => openEdit(plan)}
                onArchive={() => patchPlan(plan.id, { is_archived: true }, "Archived — hidden from your page")}
                onDelete={() => deletePlan(plan.id)}
                onLeads={() => openLeads(plan)}
                onCopyLink={() => copyPlanLink(plan)}
                onChain={() => copyChainLink(plan)}
                onPoll={() => setPollPlanId(plan.id)}
                localToday={localToday}
                circleNames={circleNames(plan.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Archived */}
      {archived.length > 0 && (
        <section className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            aria-controls="archived-plans"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Archive className="size-3.5" />
            {showArchived ? "Hide archived" : "View archived"} · {archived.length}
            <ChevronDown className={cn("size-3.5 transition-transform", showArchived && "rotate-180")} />
          </button>
          {showArchived && (
            <ul id="archived-plans" className="mt-3 space-y-2 text-left">
              {archived.map((plan) => (
                <ArchivedPlanRow
                  key={plan.id}
                  plan={plan}
                  onRestore={() => patchPlan(plan.id, { is_archived: false }, "Restored")}
                  onDelete={() => deletePlan(plan.id)}
                />
              ))}
            </ul>
          )}
        </section>
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
      <PollDrawer
        plan={pollPlan}
        onOpenChange={(o) => !o && setPollPlanId(null)}
        onCounts={onPollCounts}
        onPicked={(updated) => setPlans((ps) => ps.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))}
        onBookingSoon={(planId) => patchPlan(planId, { status: "Booking Soon" }, "Moved to Booking Soon")}
      />
      <InterestOverviewDrawer
        open={interestOpen}
        onOpenChange={setInterestOpen}
        plans={active}
        onOpenPlan={(planId) => {
          const plan = plans.find((p) => p.id === planId);
          if (!plan) return;
          setInterestOpen(false);
          openLeads(plan);
        }}
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
  onChain: () => void;
  onPoll: () => void;
  circleNames: string[];
  localToday: LocalToday;
};

function ManagePlanRow({
  plan,
  onStatus,
  onEdit,
  onArchive,
  onDelete,
  onLeads,
  onCopyLink,
  onChain,
  onPoll,
  circleNames,
  localToday,
}: ManagePlanRowProps) {
  const isCarpool = plan.category === "Carpool";
  const when = planWhen(plan, localToday.today, localToday.timeZone);
  const chained = !!(plan.suggested_by_handle || plan.chained_from_plan_id);
  // Only public plans can be copied (and so chained) by friends; never rides.
  const canChain = !chained && plan.visibility === "public" && !isCarpool;

  const CategoryIcon = CATEGORY_ICONS[plan.category];
  // Polls are for plans that are still an idea; once picked, the dates speak for themselves.
  const canPoll = plan.status === "Just an Idea" && !isCarpool && !plan.poll_closed_at;

  return (
    <li className="tap-card flex flex-col p-3">
      <div className="flex items-start gap-2">
        <p className="flex min-w-0 flex-1 items-start gap-1.5 leading-snug font-bold">
          <CategoryIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={plan.category} />
          <span className="line-clamp-2">{plan.title}</span>
        </p>
        <StatusMenu status={plan.status} onChange={onStatus} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3" />
          {isCarpool && plan.departs_at && plan.departs_tz
            ? `${plan.origin} → ${plan.destination} · ${formatDeparture(plan.departs_at, plan.departs_tz)}`
            : `${when.label}${when.rawDates ? ` · ${when.rawDates}` : ""}`}
          {when.past && " · past"}
          {plan.dates_flexible && !isCarpool && " · flexible"}
        </span>
        {plan.visibility === "circles" && (
          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">
            <UsersRound className="size-2.5 shrink-0" />
            {circleNames.length ? circleNames.join(", ") : "No circles — only you"}
          </span>
        )}
        {plan.visibility === "unlisted" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">
            <EyeOff className="size-2.5" /> Unlisted
          </span>
        )}
        {canPoll && plan.poll_option_count > 0 && (
          <button
            type="button"
            onClick={onPoll}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary hover:bg-primary/20"
          >
            <CalendarCheck className="size-2.5" />
            {plan.poll_option_count < 2 ? "Poll · add another date" : `Poll · ${plan.poll_vote_count} voted`}
          </button>
        )}
        <ChainPill plan={plan} className="px-1.5 py-px text-[10px]" />
        {canChain && (
          <button
            type="button"
            onClick={onChain}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Plus className="size-2.5" /> Chain with a friend
          </button>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1 pt-2">
        <button
          type="button"
          onClick={onLeads}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors",
            plan.interest_count > 0
              ? "bg-primary text-primary-foreground hover:bg-primary/85"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          )}
          aria-label={
            plan.capacity != null
              ? `${plan.approved_count} of ${plan.capacity} spots taken, ${plan.pending_count} waiting — see who`
              : `${commitmentSummary(plan)} — see who's interested`
          }
          title="See who's interested"
        >
          <Users className="size-3.5" />
          {plan.capacity != null ? (
            <span className="tabular-nums">
              {plan.approved_count}/{plan.capacity}
              {plan.pending_count > 0 && (
                <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950">{plan.pending_count} new</span>
              )}
            </span>
          ) : (
            <span className="tabular-nums">{commitmentSummary(plan)}</span>
          )}
        </button>
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2 text-xs">
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onCopyLink} className="h-7 px-2 text-xs" aria-label="Share: copy this plan's link">
            <Share2 /> Share
          </Button>
          <PlanMoreMenu title={plan.title} onArchive={onArchive} onDelete={onDelete} onPoll={canPoll ? onPoll : undefined} />
        </div>
      </div>
    </li>
  );
}

/** Small status pill; tapping it opens the three statuses. */
function StatusMenu({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-ring",
          STATUS_STYLES[status].pill,
        )}
        aria-label={`Status: ${status}. Change status`}
      >
        <span className={cn("size-1.5 rounded-full", STATUS_STYLES[status].dot)} aria-hidden />
        {status}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </Menu.Trigger>
      <MenuContent>
        {STATUSES.map((s) => (
          <Menu.Item key={s} className={menuItemClass} onClick={() => s !== status && onChange(s)}>
            <span className={cn("size-2 rounded-full", STATUS_STYLES[s].dot, "animate-none")} aria-hidden />
            <span className="flex-1">{s}</span>
            {s === status && <Check aria-label="current" />}
          </Menu.Item>
        ))}
      </MenuContent>
    </Menu.Root>
  );
}

/** Less-used actions. Delete needs a second tap, so its item keeps the menu open. */
function PlanMoreMenu({
  title,
  onArchive,
  onDelete,
  onPoll,
}: {
  title: string;
  onArchive: () => void;
  onDelete: () => void;
  /** Offered on "Just an Idea" plans: open the date poll. */
  onPoll?: () => void;
}) {
  const [confirmDelete, requestDelete] = useTapToConfirm(onDelete);
  return (
    <Menu.Root>
      <Menu.Trigger
        className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted"
        aria-label={`More actions for ${title}`}
      >
        <Ellipsis className="size-4" />
      </Menu.Trigger>
      <MenuContent>
        {onPoll && (
          <Menu.Item className={menuItemClass} onClick={onPoll}>
            <CalendarCheck /> Date poll
          </Menu.Item>
        )}
        <Menu.Item className={menuItemClass} onClick={onArchive}>
          <Archive /> Archive
        </Menu.Item>
        <MenuSeparator />
        <Menu.Item
          closeOnClick={false}
          onClick={requestDelete}
          className={cn(menuItemClass, "text-destructive [&_svg]:text-destructive", confirmDelete && "bg-destructive/10 font-semibold")}
        >
          <Trash2 /> {confirmDelete ? "Tap again to delete" : "Delete"}
        </Menu.Item>
      </MenuContent>
    </Menu.Root>
  );
}

/**
 * Destructive buttons ask for a second tap: the first arms it (for 3 seconds),
 * the second runs the action. Returns [armed, onClick].
 */
function useTapToConfirm(action: () => void): [boolean, () => void] {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return [armed, () => (armed ? action() : setArmed(true))];
}

function ArchivedPlanRow({ plan, onRestore, onDelete }: { plan: Plan; onRestore: () => void; onDelete: () => void }) {
  const [confirmDelete, requestDelete] = useTapToConfirm(onDelete);

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card/50 px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{plan.title}</span>
      <Button size="sm" variant="ghost" onClick={onRestore}>
        <ArchiveRestore /> Restore
      </Button>
      <Button
        size="sm"
        variant={confirmDelete ? "destructive" : "ghost"}
        onClick={requestDelete}
        aria-label={confirmDelete ? `Tap again to delete ${plan.title}` : `Delete ${plan.title}`}
      >
        <Trash2 /> {confirmDelete && "Tap to confirm"}
      </Button>
    </li>
  );
}
