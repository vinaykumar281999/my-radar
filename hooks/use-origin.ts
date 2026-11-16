"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** window.location.origin on the client, "" during SSR (no hydration mismatch). */
export function useOrigin() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
}

/** Host without protocol, e.g. "radar.app". */
export function useHost() {
  return useOrigin().replace(/^https?:\/\//, "");
}
