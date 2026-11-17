"use client";

import { useEffect, useState } from "react";
import { CalendarSync, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/components/ShareButton";
import { useOrigin } from "@/hooks/use-origin";
import { createClient } from "@/lib/supabase/client";

export function CalendarFeed({ initialToken }: { initialToken: string | null }) {
  const origin = useOrigin();
  const [token, setToken] = useState(initialToken);
  const [state, setState] = useState<"idle" | "confirm" | "pending">("idle");
  const [copied, setCopied] = useState(false);
  const feedUrl = token && origin ? `${origin}/api/ical/${token}.ics` : null;

  useEffect(() => {
    if (state !== "confirm") return;
    const t = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(t);
  }, [state]);

  async function regenerate() {
    setState("pending");
    const { data, error } = await createClient().rpc("regenerate_calendar_token");
    setState("idle");
    if (error || typeof data !== "string") {
      toast.error("Couldn't create the feed link.");
      return;
    }
    toast.success(token ? "New link created — the old one stopped working" : "Feed link created");
    setToken(data);
  }

  async function copy() {
    if (feedUrl && (await copyText(feedUrl))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Couldn't copy");
    }
  }

  return (
    <section className="tap-card p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <CalendarSync className="size-4" /> Calendar feed
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A private link with all your dated plans (including unlisted ones). In Google Calendar: Other calendars → + →
        From URL. Anyone with the link can see these plans, so keep it to yourself.
      </p>

      {token ? (
        <>
          <button
            type="button"
            onClick={copy}
            className="mt-4 flex w-full items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/70"
            aria-label="Copy calendar feed link"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{feedUrl ?? "…"}</span>
            {copied ? <Check className="size-4 shrink-0 text-emerald-500" /> : <Copy className="size-4 shrink-0" />}
          </button>
          <Button
            variant={state === "confirm" ? "destructive" : "outline"}
            size="sm"
            className="mt-3"
            onClick={() => (state === "confirm" ? regenerate() : setState("confirm"))}
            disabled={state === "pending"}
          >
            {state === "pending" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {state === "confirm" ? "Tap again: the old link stops working" : "Regenerate link"}
          </Button>
        </>
      ) : (
        <Button className="mt-4 rounded-xl" onClick={regenerate} disabled={state === "pending"}>
          {state === "pending" ? <Loader2 className="animate-spin" /> : <CalendarSync />}
          Create my feed link
        </Button>
      )}
    </section>
  );
}
