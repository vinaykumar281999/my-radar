"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactChip } from "@/components/ContactChip";
import { createClient } from "@/lib/supabase/client";
import { INTEREST_STATUS_LABEL, type Interest, type InterestStatus, type Plan } from "@/lib/types";

type Row = Pick<Interest, "id" | "plan_id" | "visitor_name" | "contact_handle" | "user_id" | "status" | "created_at">;

export type InterestPerson = {
  key: string;
  name: string;
  contact: string;
  /** Newest reaction first. */
  reactions: { interestId: string; planId: string; status: InterestStatus; created_at: string }[];
};

/**
 * One entry per person across the owner's plans: signed-in senders by account,
 * everyone else by contact handle. Most recent activity first.
 */
export function groupInterestByPerson(rows: Row[]): InterestPerson[] {
  const people = new Map<string, InterestPerson>();
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const key = r.user_id ? `u:${r.user_id}` : `c:${r.contact_handle.trim().toLowerCase()}`;
    const person = people.get(key) ?? { key, name: r.visitor_name, contact: r.contact_handle, reactions: [] };
    person.reactions.push({ interestId: r.id, planId: r.plan_id, status: r.status, created_at: r.created_at });
    people.set(key, person);
  }
  return [...people.values()];
}

/**
 * Everyone who reacted to any of the owner's active plans. Loaded in the
 * browser under RLS, which gives a plan's owner its interests and nobody else.
 */
export function InterestOverviewDrawer({
  open,
  onOpenChange,
  plans,
  onOpenPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Pick<Plan, "id" | "title">[];
  /** Open that plan's own interest drawer. */
  onOpenPlan: (planId: string) => void;
}) {
  const planIds = plans.map((p) => p.id).join(",");
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[] | null; error: boolean } | null>(null);
  const current = loaded?.key === planIds ? loaded : null;

  useEffect(() => {
    if (!open || !planIds) return;
    let cancelled = false;
    createClient()
      .from("interests")
      .select("id, plan_id, visitor_name, contact_handle, user_id, status, created_at")
      .in("plan_id", planIds.split(","))
      .returns<Row[]>()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("interest overview", error);
        setLoaded({ key: planIds, rows: data ?? null, error: !!error });
      });
    return () => {
      cancelled = true;
    };
  }, [open, planIds]);

  // No active plans: nothing to load.
  const rows = planIds ? (current?.rows ?? null) : [];
  const people = rows ? groupInterestByPerson(rows) : null;
  const total = rows?.length ?? 0;
  const title = (id: string) => plans.find((p) => p.id === id)?.title ?? "A plan";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="size-5 text-primary" /> Who&apos;s interested
          </DrawerTitle>
          <DrawerDescription className="text-left">
            {people
              ? people.length === 0
                ? "Across everything on your radar"
                : `${people.length} ${people.length === 1 ? "person" : "people"} · ${total} ${total === 1 ? "reaction" : "reactions"} across your plans`
              : "Loading…"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {current?.error ? (
            <p className="text-sm text-destructive">Couldn&apos;t load who&apos;s interested. Try again in a moment.</p>
          ) : !people ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : people.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No one yet. Share your bio link and reactions will show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {people.map((person) => (
                <li key={person.key} className="rounded-xl border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold">{person.name}</p>
                    <ContactChip contact={person.contact} />
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {person.reactions.map((r) => (
                      <li key={r.interestId}>
                        <button
                          type="button"
                          onClick={() => onOpenPlan(r.planId)}
                          className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                        >
                          <span className="truncate">{title(r.planId)}</span>
                          <span className="font-medium text-primary/70">· {INTEREST_STATUS_LABEL[r.status]}</span>
                          <ChevronRight className="size-3 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
