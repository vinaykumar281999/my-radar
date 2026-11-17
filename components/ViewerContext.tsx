"use client";

import { createContext, use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Viewer = { id: string; username: string };

/**
 * "loading": not known yet (always the case during server render).
 * "signed_out": no session. "no_profile": signed in but not onboarded.
 */
export type ViewerStatus = "loading" | "signed_out" | "no_profile" | "ready";

const ViewerContext = createContext<{ viewer: Viewer | null; status: ViewerStatus }>({
  viewer: null,
  status: "loading",
});

/**
 * Detects a signed-in (and onboarded) visitor on otherwise-public pages.
 * Runs client-side so the server render of public pages never depends on who
 * is looking: it's identical for everyone, and can't include private plans.
 */
export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ viewer: Viewer | null; status: ViewerStatus }>({
    viewer: null,
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        setState({ viewer: null, status: "signed_out" });
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("id", session.user.id)
        .maybeSingle<Viewer>();
      if (!cancelled) setState(data ? { viewer: data, status: "ready" } : { viewer: null, status: "no_profile" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ViewerContext value={state}>{children}</ViewerContext>;
}

/** The signed-in visitor, or null (signed out, loading, not onboarded, or no provider). */
export function useViewer() {
  return use(ViewerContext).viewer;
}

export function useViewerStatus() {
  return use(ViewerContext).status;
}
