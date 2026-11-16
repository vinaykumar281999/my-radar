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
import { createClient } from "@/lib/supabase/client";
import type { Interest, Plan } from "@/lib/types";

type LeadsDrawerProps = {
  plan: Plan | null;
  onOpenChange: (open: boolean) => void;
  onCountChange: (planId: string, count: number) => void;
};

export function LeadsDrawer({ plan, onOpenChange, onCountChange }: LeadsDrawerProps) {
  const planId = plan?.id;
  // Loaded leads, keyed by plan so switching plans shows a fresh loading state.
  const [loaded, setLoaded] = useState<{ planId: string; leads: Interest[] | null; error: string | null } | null>(
    null,
  );
  const current = loaded && loaded.planId === planId ? loaded : null;
  const leads = current?.leads ?? null;
  const error = current?.error ?? null;

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

  async function removeLead(id: string) {
    if (!planId) return;
    const prev = leads;
    const next = (leads ?? []).filter((l) => l.id !== id);
    setLeads(next);
    const { error } = await createClient().from("interests").delete().eq("id", id);
    if (error) {
      setLeads(prev);
      toast.error("Couldn't remove that one.");
    } else {
      onCountChange(planId, next.length);
    }
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
          ) : (
            <ul className="space-y-3">
              {leads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onRemove={() => removeLead(lead.id)} />
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function LeadRow({ lead, onRemove }: { lead: Interest; onRemove: () => void }) {
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{lead.visitor_name}</p>
          <p className="text-xs text-muted-foreground">{timeAgo(lead.created_at)}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${lead.visitor_name}`}>
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/70"
      >
        <span className="truncate">{lead.contact_handle}</span>
        {copied ? <Check className="size-4 shrink-0 text-emerald-500" /> : <Copy className="size-4 shrink-0 text-muted-foreground" />}
      </button>
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
