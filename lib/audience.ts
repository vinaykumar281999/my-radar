import type { Plan } from "@/lib/types";

/**
 * Who-sees-what rules used by the UI. The database enforces the same rules
 * (RLS, get_public_plan, guard_plan_copy); these keep the UI from even offering
 * something the database would refuse.
 */

/**
 * Plans that may appear on the shareable story image: exactly what the public
 * page lists. An allowlist on purpose, so any new audience type is excluded by default.
 */
export function storyPlans<T extends Pick<Plan, "is_archived" | "visibility">>(plans: T[]): T[] {
  return plans.filter((p) => !p.is_archived && p.visibility === "public");
}

/**
 * "Copy to my Radar" is offered only on public plans, to a signed-in viewer who
 * isn't the owner. Unlisted and circle plans can't be copied (guard_plan_copy
 * refuses too), since a copy would republish them on the copier's page.
 */
export function canCopyPlan(
  plan: { user_id?: string; visibility?: Plan["visibility"] },
  viewerId: string | null,
  { demo, hostUsername }: { demo?: boolean; hostUsername?: string },
) {
  return !demo && !!viewerId && !!hostUsername && plan.visibility === "public" && viewerId !== plan.user_id;
}
