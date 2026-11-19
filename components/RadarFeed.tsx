"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Lock, X } from "lucide-react";
import { PlanCard } from "@/components/PlanCard";
import { useViewer, useViewerStatus } from "@/components/ViewerContext";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, STATUSES, groupByTimeframe, type Plan, type Spots } from "@/lib/types";
import {
  NO_FILTERS,
  applyFilters,
  filtersToSearch,
  hasFilters,
  parseFilters,
  type FeedFilters,
} from "@/lib/feed-filters";
import { cn } from "@/lib/utils";

export type SharedPlan = Plan & { shared_via: string[] };

/**
 * A profile's plans grouped by timeframe. The server passes only public plans,
 * so the server-rendered HTML is the same for every visitor. Plans shared with
 * a signed-in member's circles are added here, in the browser, under RLS.
 */
export function RadarFeed({
  ownerId,
  hostName,
  hostUsername,
  publicPlans,
  publicSpots,
}: {
  ownerId: string;
  hostName: string;
  hostUsername: string;
  publicPlans: Plan[];
  /** Spots for public plans, counted anonymously on the server. */
  publicSpots: Record<string, Spots>;
}) {
  const viewer = useViewer();
  const { plans: shared, spots: sharedSpots } = useViewerExtras(ownerId, viewer?.id ?? null);
  const spots = { ...publicSpots, ...sharedSpots };
  const sharedVia = new Map(shared.map((p) => [p.id, p.shared_via]));
  const [filters, setFilters] = useFeedFilters();
  const visible = [...publicPlans, ...shared];
  const groups = groupByTimeframe(applyFilters(visible, filters));

  if (visible.length === 0) {
    return (
      <div className="tap-card mt-8 px-6 py-10 text-center">
        <p className="text-3xl">🛰️</p>
        <p className="mt-3 font-semibold">Nothing on the radar yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hostName.split(" ")[0]} hasn&apos;t posted any plans. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <FilterChips filters={filters} onChange={setFilters} />
      {groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No plans match</p>
      )}
      {groups.map((group) => (
        <section key={group.timeframe} aria-labelledby={`tf-${group.timeframe}`}>
          <h2
            id={`tf-${group.timeframe}`}
            className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            {group.timeframe}
            <span className="h-px flex-1 bg-border" />
          </h2>
          <div className="space-y-3">
            {group.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                hostName={hostName}
                hostUsername={hostUsername}
                sharedVia={sharedVia.get(plan.id)}
                spots={spots[plan.id]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Hydrated yet? Always false on the server and during hydration. */
const noopSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Filters from ?category=&status=, read only after hydration so the server
 * render (and the hydration pass) never depend on the query string. Changes go
 * through history.replaceState, which Next keeps in sync with useSearchParams
 * without a server round trip.
 */
function useFeedFilters(): [FeedFilters, (f: FeedFilters) => void] {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const filters = hydrated ? parseFilters(params) : NO_FILTERS;
  const setFilters = (f: FeedFilters) => {
    const search = filtersToSearch(window.location.search, f);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  };
  return [filters, setFilters];
}

function FilterChips({ filters, onChange }: { filters: FeedFilters; onChange: (f: FeedFilters) => void }) {
  return (
    <div className="space-y-2" role="group" aria-label="Filter plans">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            active={filters.category === c}
            onClick={() => onChange({ ...filters, category: filters.category === c ? null : c })}
          >
            {c}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Chip
            key={s}
            active={filters.status === s}
            onClick={() => onChange({ ...filters, status: filters.status === s ? null : s })}
          >
            {s}
          </Chip>
        ))}
        {hasFilters(filters) && (
          <Chip active={false} onClick={() => onChange(NO_FILTERS)}>
            <X className="size-3" /> Clear
          </Chip>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

type Extras = { plans: SharedPlan[]; spots: Record<string, Spots> };
const NONE: Extras = { plans: [], spots: {} };

/**
 * For a signed-in visitor (not the owner): plans shared with their circles and
 * spot counts for those, read with their session so RLS decides.
 */
function useViewerExtras(ownerId: string, viewerId: string | null): Extras {
  const [loaded, setLoaded] = useState<{ key: string; extras: Extras } | null>(null);
  const key = `${ownerId}:${viewerId}`;

  useEffect(() => {
    if (!viewerId || viewerId === ownerId) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("get_shared_plans", { p_owner_id: ownerId });
      if (error) console.error("get_shared_plans", error);
      const plans = (data as SharedPlan[] | null) ?? [];
      const withSpots = plans.filter((p) => p.capacity != null).map((p) => p.id);
      const { data: spotRows } = withSpots.length
        ? await supabase.rpc("plan_spots", { p_plan_ids: withSpots })
        : { data: [] };
      if (cancelled) return;
      setLoaded({
        key: `${ownerId}:${viewerId}`,
        extras: {
          plans,
          spots: Object.fromEntries(
            ((spotRows as { plan_id: string; capacity: number; taken: number }[] | null) ?? []).map((r) => [
              r.plan_id,
              { capacity: r.capacity, taken: r.taken },
            ]),
          ),
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, viewerId]);

  return loaded?.key === key ? loaded.extras : NONE;
}

/**
 * Shown to every signed-out visitor on every profile and plan page, whether or
 * not anything is shared, so its presence never hints that hidden plans exist.
 */
export function SharedSignInPrompt({ next, className }: { next: string; className?: string }) {
  const status = useViewerStatus();
  // Built in the browser so signing in returns to the same (filtered) view.
  // status is only ever "signed_out" after hydration, so the server never uses these.
  const pathname = usePathname();
  const search = useSearchParams()?.toString();
  if (status !== "signed_out") return null;
  const returnTo = pathname ? `${pathname}${search ? `?${search}` : ""}` : next;
  return (
    <p className={className}>
      <Link
        href={`/login?next=${encodeURIComponent(returnTo)}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Lock className="size-3" /> Sign in to see plans shared with you
      </Link>
    </p>
  );
}
