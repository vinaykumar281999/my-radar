"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/components/ShareButton";
import { ContactChip } from "@/components/ContactChip";
import { BlockButton, BulkToolbar, matchesQuery, toggleAll } from "@/components/BulkToolbar";
import { parseContact } from "@/lib/contact";
import { csvFilename, downloadCsv, toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/client";
import type { BlockResult, Interest, Plan } from "@/lib/types";

type LeadsDrawerProps = {
  plan: Plan | null;
  onOpenChange: (open: boolean) => void;
  onCountChange: (planId: string, count: number) => void;
  /** A sender was blocked: their pitches/interests everywhere were cleared. */
  onBlocked: (result: BlockResult) => void;
};

export function LeadsDrawer({ plan, onOpenChange, onCountChange, onBlocked }: LeadsDrawerProps) {
  const planId = plan?.id;
  // Loaded leads, keyed by plan so switching plans shows a fresh loading state.
  const [loaded, setLoaded] = useState<{ planId: string; leads: Interest[] | null; error: string | null } | null>(
    null,
  );
  const current = loaded && loaded.planId === planId ? loaded : null;
  const leads = current?.leads ?? null;
  const error = current?.error ?? null;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);

  const visible = (leads ?? []).filter((l) => matchesQuery(query, [l.visitor_name, l.contact_handle, l.message]));
  const selectedVisible = visible.filter((l) => selected.has(l.id));

  function setLeads(next: Interest[] | null) {
    if (planId) setLoaded({ planId, leads: next, error: null });
  }

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    createClient()
      .from("interests")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
      .returns<Interest[]>()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoaded({ planId, leads: null, error: error.message });
        else {
          setLoaded({ planId, leads: data ?? [], error: null });
          onCountChange(planId, data?.length ?? 0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [planId, onCountChange]);

  async function removeLeads(ids: string[]) {
    if (!planId || ids.length === 0) return false;
    const prev = leads;
    const next = (leads ?? []).filter((l) => !ids.includes(l.id));
    setLeads(next);
    const { error } = await createClient().from("interests").delete().in("id", ids);
    if (error) {
      setLeads(prev);
      toast.error(ids.length === 1 ? "Couldn't remove that one." : "Couldn't remove those.");
      return false;
    }
    onCountChange(planId, next.length);
    return true;
  }

  async function removeSelected() {
    const ids = selectedVisible.map((l) => l.id);
    setBulkPending(true);
    const ok = await removeLeads(ids);
    setBulkPending(false);
    if (ok) {
      setSelected(new Set());
      toast.success(`Removed ${ids.length}`);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBlocked(result: BlockResult) {
    const removed = new Set(result.interests.map((i) => i.id));
    setLeads((leads ?? []).filter((l) => !removed.has(l.id)));
    onBlocked(result);
  }

  function exportCsv() {
    const csv = toCsv(
      ["Received", "Name", "Contact", "Note", "Plan"],
      visible.map((l) => [l.created_at, l.visitor_name, l.contact_handle, l.message, plan?.title]),
    );
    downloadCsv(csvFilename("interested"), csv);
  }

  return (
    <Drawer open={!!plan} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="size-5 text-primary" /> Interested friends
          </DrawerTitle>
          <DrawerDescription className="text-left">{plan?.title}</DrawerDescription>
        </DrawerHeader>

        {leads && leads.length > 0 && (
          <BulkToolbar
            query={query}
            onQuery={setQuery}
            placeholder="Search name, contact, note"
            visibleCount={visible.length}
            selectedCount={selectedVisible.length}
            onToggleAll={() => setSelected((s) => toggleAll(s, visible.map((l) => l.id)))}
            bulkLabel="Remove"
            onBulk={removeSelected}
            bulkPending={bulkPending}
            onExport={exportCsv}
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : leads === null ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : leads.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-3xl">👀</p>
              <p className="mt-2 font-semibold">No one yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Share your link — the first “I&apos;m in” is the hardest.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No one matches “{query}”.</p>
          ) : (
            <ul className="space-y-3">
              {visible.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  selected={selected.has(lead.id)}
                  onToggle={() => toggle(lead.id)}
                  onRemove={() => removeLeads([lead.id])}
                  onBlocked={handleBlocked}
                />
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function LeadRow({
  lead,
  selected,
  onToggle,
  onRemove,
  onBlocked,
}: {
  lead: Interest;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onBlocked: (result: BlockResult) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(lead.contact_handle)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Couldn't copy");
    }
  }

  return (
    <li className="rounded-xl border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${lead.visitor_name}`}
          className="mt-1 size-4 shrink-0 accent-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{lead.visitor_name}</p>
          <p className="text-xs text-muted-foreground">{timeAgo(lead.created_at)}</p>
        </div>
        <BlockButton contact={lead.contact_handle} onBlocked={onBlocked} />
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${lead.visitor_name}`}>
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/70"
          aria-label={`Copy ${lead.contact_handle}`}
        >
          <span className="truncate">{lead.contact_handle}</span>
          {copied ? <Check className="size-4 shrink-0 text-emerald-500" /> : <Copy className="size-4 shrink-0 text-muted-foreground" />}
        </button>
        {parseContact(lead.contact_handle) && (
          <ContactChip
            contact={lead.contact_handle}
            className="h-9 shrink-0 rounded-lg px-3 [&>span]:max-w-28"
          />
        )}
      </div>
      {lead.message && (
        <p className="mt-2 flex gap-2 text-sm text-foreground/80">
          <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          {lead.message}
        </p>
      )}
    </li>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
