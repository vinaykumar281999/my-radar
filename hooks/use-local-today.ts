"use client";

import { useSyncExternalStore } from "react";
import { localIsoDate } from "@/lib/dates";

export type LocalToday = { today: string; timeZone: string };

// Re-check once a minute so the date rolls over at the viewer's midnight.
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

// A string, so React sees the same snapshot until the date or zone changes.
const clientSnapshot = () => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return `${localIsoDate(new Date(), timeZone)}|${timeZone}`;
};
const serverSnapshot = () => `${localIsoDate(new Date(), "UTC")}|UTC`;

/**
 * The viewer's own calendar date and time zone. The server render (and
 * hydration) use UTC; right after hydration it switches to the browser's
 * zone, so there's no mismatch and the dashboard ends up on local time.
 */
export function useLocalToday(): LocalToday {
  const [today, timeZone] = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot).split("|");
  return { today, timeZone };
}
