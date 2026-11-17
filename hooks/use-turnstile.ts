"use client";

import { useCallback, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Invisible Cloudflare Turnstile. Attach `containerRef` to an element inside
 * the form, then `await getToken()` on submit for a fresh single-use token.
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY this is a no-op that returns null.
 */
export function useTurnstile() {
  const widgetId = useRef<string | null>(null);
  const pending = useRef<((token: string | null) => void) | null>(null);

  const settle = useCallback((token: string | null) => {
    pending.current?.(token);
    pending.current = null;
  }, []);

  // Callback ref: renders the widget when the form mounts, removes it on unmount.
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !SITE_KEY) return;
      let cancelled = false;
      let id: string | null = null;
      loadScript()
        .then(() => {
          if (cancelled || !window.turnstile) return;
          id = window.turnstile.render(el, {
            sitekey: SITE_KEY,
            execution: "execute",
            // Only appears if Cloudflare needs the visitor to click something.
            appearance: "interaction-only",
            callback: (token: string) => settle(token),
            "error-callback": () => settle(null),
            "timeout-callback": () => settle(null),
          });
          widgetId.current = id;
        })
        .catch(() => settle(null));
      return () => {
        cancelled = true;
        if (id) window.turnstile?.remove(id);
        if (widgetId.current === id) widgetId.current = null;
      };
    },
    [settle],
  );

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!SITE_KEY) return null;
    // The script may still be loading on a fast submit.
    for (let i = 0; i < 50 && !widgetId.current; i++) await sleep(100);
    const id = widgetId.current;
    if (!id || !window.turnstile) return null;

    settle(null);
    return new Promise<string | null>((resolve) => {
      pending.current = resolve;
      window.turnstile!.reset(id);
      window.turnstile!.execute(id);
      // Interactive challenges can take a while; give up after 60s.
      setTimeout(() => {
        if (pending.current === resolve) settle(null);
      }, 60_000);
    });
  }, [settle]);

  return { containerRef, getToken };
}
