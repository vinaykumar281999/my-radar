import { formatDateRange } from "@/lib/dates";
import type { Category, CircleOption, PlanInput } from "@/lib/types";

/**
 * Change a plan form's category. Safety default: a NEW carpool that was going
 * to be public starts shared with circles only (the owner can still choose
 * Public, behind a confirmation). Carpools are never "flexible on dates".
 */
export function withCategory<T extends Pick<PlanInput, "category" | "visibility" | "dates_flexible">>(
  form: T,
  category: Category,
  isNew: boolean,
): T {
  return {
    ...form,
    category,
    visibility: category === "Carpool" && isNew && form.visibility === "public" ? "circles" : form.visibility,
    dates_flexible: category === "Carpool" ? false : form.dates_flexible,
  };
}

/** Circles the owner marked "preselect for new plans". */
export function preselectedCircleIds(circles: CircleOption[]): string[] {
  return circles.filter((c) => c.preselect_for_new_plans).map((c) => c.id);
}

/** The default spots to suggest: only when exactly one circle is picked and it has one. */
export function circleDefaultCapacity(selectedIds: string[], circles: CircleOption[]): number | null {
  if (selectedIds.length !== 1) return null;
  return circles.find((c) => c.id === selectedIds[0])?.default_capacity ?? null;
}

type MoreOptionsFields = Pick<
  PlanInput,
  "category" | "visibility" | "start_date" | "end_date" | "dates_flexible" | "capacity" | "status" | "decide_by" | "specific_dates"
>;

/**
 * Should "More options" open by itself? Yes when:
 * - editing a plan that already uses anything in there (not public, dates,
 *   flexible, spots, a decide-by date, old text dates, or it's a carpool);
 * - Carpool is chosen (its route, departure and seats are required);
 * - the plan is Booking Soon with a decide-by date.
 * It never closes by itself; the owner can always toggle it.
 */
export function moreOptionsAutoOpen(form: MoreOptionsFields, { editing }: { editing: boolean }): boolean {
  if (form.category === "Carpool") return true;
  if (form.status === "Booking Soon" && !!form.decide_by) return true;
  if (!editing) return false;
  return (
    form.visibility !== "public" ||
    !!form.start_date ||
    !!form.dates_flexible ||
    form.capacity != null ||
    !!form.specific_dates?.trim()
  );
}

const VISIBILITY_SHORT = { public: "Public", unlisted: "Unlisted", circles: "Circles" } as const;

/** One line for the collapsed "More options" row: "Public · no dates", "Circles · Dec 11–14 · 4 spots"… */
export function moreOptionsSummary(
  form: MoreOptionsFields & Partial<Pick<PlanInput, "origin" | "destination" | "round_trip">>,
  { circleNames = [] as string[] } = {},
): string {
  const parts: string[] =
    form.visibility === "circles" && circleNames.length
      ? [`Circles: ${circleNames.join(", ")}`]
      : [VISIBILITY_SHORT[form.visibility]];
  if (form.category === "Carpool") {
    if (form.origin?.trim() && form.destination?.trim()) parts.push(`${form.origin.trim()} → ${form.destination.trim()}`);
    else parts.push("route needed");
    if (form.round_trip) parts.push("round trip");
  } else {
    parts.push(form.start_date ? formatDateRange(form.start_date, form.end_date || null) : "no dates");
    if (form.dates_flexible) parts.push("flexible");
  }
  if (form.capacity != null) parts.push(`${form.capacity} ${form.category === "Carpool" ? "seats" : "spots"}`);
  if (form.status === "Booking Soon" && form.decide_by) {
    parts.push(`${form.category === "Carpool" ? "confirm seats by" : "decide by"} ${shortDate(form.decide_by)}`);
  }
  return parts.join(" · ");
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
