import { CATEGORIES, STATUSES, type Category, type Plan, type Status } from "@/lib/types";

/**
 * Profile filters (?category=&status=). Applied only in the browser, over
 * plans the viewer can already see: the server never reads these, so its HTML
 * is the same for every query string.
 */
export type FeedFilters = { category: Category | null; status: Status | null };

export const NO_FILTERS: FeedFilters = { category: null, status: null };

type ParamsLike = { get(name: string): string | null };

/** Unknown values are ignored, never echoed. */
export function parseFilters(params: ParamsLike | null | undefined): FeedFilters {
  const category = params?.get("category") ?? null;
  const status = params?.get("status") ?? null;
  return {
    category: (CATEGORIES as readonly string[]).includes(category ?? "") ? (category as Category) : null,
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as Status) : null,
  };
}

export function hasFilters(f: FeedFilters) {
  return f.category !== null || f.status !== null;
}

export function applyFilters<T extends Pick<Plan, "category" | "status">>(plans: T[], f: FeedFilters): T[] {
  return plans.filter((p) => (!f.category || p.category === f.category) && (!f.status || p.status === f.status));
}

/** The query string for these filters, keeping any other params. "" when empty. */
export function filtersToSearch(current: string, f: FeedFilters) {
  const params = new URLSearchParams(current);
  for (const key of ["category", "status"] as const) {
    const value = f[key];
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
