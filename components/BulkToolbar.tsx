"use client";

import { useEffect, useState } from "react";
import { Ban, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BlockResult } from "@/lib/types";

type BulkToolbarProps = {
  query: string;
  onQuery: (query: string) => void;
  placeholder: string;
  /** Items currently shown (after search). */
  visibleCount: number;
  selectedCount: number;
  onToggleAll: () => void;
  bulkLabel: string;
  onBulk: () => void;
  bulkPending: boolean;
  onExport: () => void;
};

/** Search + select-all + one bulk action + CSV export, for long lists in drawers. */
export function BulkToolbar({
  query,
  onQuery,
  placeholder,
  visibleCount,
  selectedCount,
  onToggleAll,
  bulkLabel,
  onBulk,
  bulkPending,
  onExport,
}: BulkToolbarProps) {
  const allSelected = visibleCount > 0 && selectedCount === visibleCount;

  return (
    <div className="space-y-2 border-b px-4 pb-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 pl-9 text-base"
        />
      </div>
      <div className="flex min-h-8 items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selectedCount > 0 && !allSelected;
            }}
            onChange={onToggleAll}
            disabled={visibleCount === 0}
            className="size-4 accent-foreground"
          />
          {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
        </label>
        <div className="ml-auto flex items-center gap-1">
          {selectedCount > 0 && (
            <Button size="sm" variant="destructive" onClick={onBulk} disabled={bulkPending}>
              {bulkPending && <Loader2 className="animate-spin" />}
              {bulkLabel} {selectedCount}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onExport} disabled={visibleCount === 0}>
            <Download /> CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Case-insensitive match of a search query against any of the fields. */
export function matchesQuery(query: string, fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
}

/** Toggle every visible id: select all of them, or clear them if all are selected. */
export function toggleAll(selected: Set<string>, visibleIds: string[]) {
  const next = new Set(selected);
  const all = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
  visibleIds.forEach((id) => (all ? next.delete(id) : next.add(id)));
  return next;
}

/**
 * Two-tap "Block" for a sender. Blocking also dismisses their pending pitches
 * and deletes their interests (see block_contact in schema.sql).
 */
export function BlockButton({
  contact,
  onBlocked,
  className,
}: {
  contact: string;
  onBlocked: (result: BlockResult) => void;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "confirm" | "pending">("idle");

  useEffect(() => {
    if (state !== "confirm") return;
    const t = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(t);
  }, [state]);

  async function block() {
    setState("pending");
    const { data, error } = await createClient().rpc("block_contact", { p_contact: contact });
    if (error || !data) {
      setState("idle");
      toast.error("Couldn't block that sender.");
      return;
    }
    toast.success(`Blocked ${contact}`, {
      description: "Their pitches and interests are hidden from you. Undo in Settings.",
    });
    onBlocked(data as BlockResult);
  }

  return (
    <Button
      size="sm"
      variant={state === "idle" ? "ghost" : "destructive"}
      onClick={() => (state === "confirm" ? block() : setState("confirm"))}
      disabled={state === "pending"}
      className={cn(state === "idle" && "text-muted-foreground", className)}
      aria-label={state === "confirm" ? `Confirm blocking ${contact}` : `Block ${contact}`}
    >
      {state === "pending" ? <Loader2 className="animate-spin" /> : <Ban />}
      {state === "confirm" ? "Tap to block" : "Block"}
    </Button>
  );
}
