"use client";

import { createContext, use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Viewer = { id: string; username: string };

const ViewerContext = createContext<Viewer | null>(null);

/**
 * Detects a signed-in (and onboarded) visitor on otherwise-public pages.
 * Runs client-side so the public page itself stays cookieless and cacheable.
 */
export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("id", session.user.id)
        .maybeSingle<Viewer>();
      if (!cancelled && data) setViewer(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

/** The signed-in visitor, or null (signed out, not onboarded, or no provider). */
export function useViewer() {
  return use(ViewerContext);
}
