import { withCategory } from "@/lib/plan-form";
import type { PlanInput } from "@/lib/types";

/**
 * Fields a template may fill. Never who can see the plan: visibility (and any
 * circle selection, which isn't part of PlanInput) is always the owner's call.
 */
export type PlanTemplateFields = Omit<Partial<PlanInput>, "visibility"> & { visibility?: never };

export type PlanTemplate = { id: string; label: string; emoji: string; fields: PlanTemplateFields };

/** Every template sets capacity explicitly (null = no spots) so switching templates resets it. */
export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    id: "weekend-cabin",
    label: "Weekend Cabin",
    emoji: "🏡",
    fields: { category: "Weekend", status: "Just an Idea", title: "Cabin weekend", capacity: 6 },
  },
  {
    id: "road-trip",
    label: "Road Trip",
    emoji: "🛣️",
    fields: { category: "Trip", status: "Just an Idea", title: "Road trip", capacity: 4 },
  },
  {
    id: "concert",
    label: "Concert / Night Out",
    emoji: "🎶",
    fields: { category: "Concert", status: "Just an Idea", title: "Concert night", capacity: null },
  },
  {
    id: "day-hike",
    label: "Day Hike",
    emoji: "🥾",
    fields: { category: "Trip", status: "Just an Idea", title: "Day hike", capacity: null },
  },
  {
    id: "ride-share",
    label: "Ride Share",
    emoji: "🚗",
    fields: { category: "Carpool", status: "Just an Idea", title: "Ride share", capacity: 3 },
  },
];

const TEMPLATE_TITLES = new Set(PLAN_TEMPLATES.map((t) => t.fields.title));

/**
 * Fill a NEW plan's form from a template. Saves nothing. The title is only
 * replaced when it's empty or still another template's title. The category goes
 * through withCategory(), so the carpool -> circles-only default applies.
 */
export function applyTemplate(form: PlanInput, template: PlanTemplate): PlanInput {
  // Belt and braces for the type: never copy an audience field.
  const { category, title, visibility: _ignored, ...rest } = template.fields as PlanTemplateFields & {
    visibility?: unknown;
  };
  void _ignored;
  const keepTitle = form.title.trim() !== "" && !TEMPLATE_TITLES.has(form.title);
  const next: PlanInput = { ...form, ...rest, title: keepTitle ? form.title : (title ?? form.title) };
  return category ? withCategory(next, category, true) : next;
}
