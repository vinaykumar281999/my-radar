import type { Category, PlanInput } from "@/lib/types";

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
