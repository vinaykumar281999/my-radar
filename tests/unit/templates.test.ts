import assert from "node:assert/strict";
import { CATEGORIES, type PlanInput } from "@/lib/types";
import { PLAN_TEMPLATES, applyTemplate, type PlanTemplateFields } from "@/lib/templates";
import { withCategory } from "@/lib/plan-form";

const EMPTY: PlanInput = {
  title: "",
  category: "Trip",
  timeframe: "This Month",
  status: "Booking Soon",
  specific_dates: "",
  start_date: "",
  end_date: "",
  dates_flexible: false,
  decide_by: "",
  notes: "",
  visibility: "public",
  capacity: null,
  origin: "",
  destination: "",
  departs_at: null,
  departs_tz: null,
};

test("every template has a valid category and starts as Just an Idea", () => {
  assert.equal(PLAN_TEMPLATES.length, 5);
  for (const t of PLAN_TEMPLATES) {
    assert.ok((CATEGORIES as readonly string[]).includes(t.fields.category ?? ""), t.id);
    assert.equal(t.fields.status, "Just an Idea", t.id);
    assert.ok(t.fields.title, t.id);
  }
});

test("no template carries visibility or any audience field", () => {
  for (const t of PLAN_TEMPLATES) {
    assert.equal("visibility" in t.fields, false, t.id);
    for (const key of Object.keys(t.fields)) assert.ok(!/visib|audien|circle/i.test(key), `${t.id}.${key}`);
  }
  // The type refuses it too.
  // @ts-expect-error visibility is not allowed in a template
  const bad: PlanTemplateFields = { visibility: "public" };
  void bad;
});

test("applying Ride Share ends up circles-only through the carpool rule", () => {
  const rideShare = PLAN_TEMPLATES.find((t) => t.id === "ride-share")!;
  const form = applyTemplate(EMPTY, rideShare);
  assert.equal(form.category, "Carpool");
  assert.equal(form.visibility, "circles");
  assert.deepEqual(form, withCategory({ ...EMPTY, ...rideShare.fields, category: "Trip" }, "Carpool", true));
});

test("templates never widen an audience the owner already chose", () => {
  for (const visibility of ["unlisted", "circles"] as const) {
    for (const t of PLAN_TEMPLATES) {
      assert.equal(applyTemplate({ ...EMPTY, visibility }, t).visibility, visibility, `${t.id} from ${visibility}`);
    }
  }
});

test("templates fill a placeholder title but keep one the owner typed", () => {
  const cabin = PLAN_TEMPLATES[0];
  const hike = PLAN_TEMPLATES.find((t) => t.id === "day-hike")!;
  assert.equal(applyTemplate(EMPTY, cabin).title, "Cabin weekend");
  assert.equal(applyTemplate(applyTemplate(EMPTY, cabin), hike).title, "Day hike");
  assert.equal(applyTemplate(applyTemplate(EMPTY, cabin), hike).capacity, null, "switching template resets spots");
  assert.equal(applyTemplate({ ...EMPTY, title: "Yosemite" }, cabin).title, "Yosemite");
});

test("carpools are never flexible on dates", () => {
  const flexible = { ...EMPTY, dates_flexible: true };
  assert.equal(withCategory(flexible, "Carpool", true).dates_flexible, false);
  assert.equal(withCategory(flexible, "Trip", true).dates_flexible, true);
});
