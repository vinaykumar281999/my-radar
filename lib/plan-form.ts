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
