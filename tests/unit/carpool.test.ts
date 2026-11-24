import assert from "node:assert/strict";
import { CARPOOL_STATUS_LABELS, STATUSES, statusLabel } from "@/lib/types";
import { applyFilters, parseFilters } from "@/lib/feed-filters";
import { carpoolExtras, currencyForLocale, formatGasSplit, formatReturn } from "@/lib/carpool";
import { decideByInfo, decideByStatic } from "@/lib/decide-by";
import { moreOptionsSummary } from "@/lib/plan-form";

test("every status has a carpool label; other plans keep the usual words", () => {
  for (const status of STATUSES) {
    assert.ok(CARPOOL_STATUS_LABELS[status]?.trim(), `carpool label for ${status}`);
    assert.equal(statusLabel(status, "Carpool"), CARPOOL_STATUS_LABELS[status]);
    assert.equal(statusLabel(status, "Trip"), status);
    assert.equal(statusLabel(status), status, "no category: the usual words");
  }
  assert.deepEqual(STATUSES.map((s) => statusLabel(s, "Carpool")), ["Might drive 🤔", "Driving 🚗", "Confirmed ✅"]);
  assert.equal(new Set(Object.values(CARPOOL_STATUS_LABELS)).size, STATUSES.length, "no two statuses share a label");
});

test("the profile's status filter chips keep the usual names and still match carpools", () => {
  const plans = [
    { id: "ride", category: "Carpool" as const, status: "Booking Soon" as const },
    { id: "trip", category: "Trip" as const, status: "Booking Soon" as const },
    { id: "idea", category: "Carpool" as const, status: "Just an Idea" as const },
  ];
  const filters = parseFilters(new URLSearchParams("status=Booking Soon"));
  assert.deepEqual(applyFilters(plans, filters).map((p) => p.id), ["ride", "trip"]);
});

test("the gas split's currency comes from the driver's browser locale", () => {
  assert.equal(currencyForLocale("en-US"), "USD");
  assert.equal(currencyForLocale("de-DE"), "EUR");
  assert.equal(currencyForLocale("fr"), "EUR", "language only: its likely region");
  assert.equal(currencyForLocale("en-GB"), "GBP");
  assert.equal(currencyForLocale("ja-JP"), "JPY");
  assert.equal(currencyForLocale("en-IN"), "INR");
  assert.equal(currencyForLocale("xx-ZZ"), "USD", "unknown: USD");
  assert.equal(currencyForLocale(undefined), "USD");
  assert.equal(currencyForLocale("not a locale!"), "USD");
});

test("gas reads like ~$40/person gas, the same everywhere", () => {
  assert.equal(formatGasSplit(40, "USD"), "~$40/person gas");
  assert.equal(formatGasSplit(12.5, "EUR"), "~€12.50/person gas");
  assert.equal(formatGasSplit(0, "USD"), "~$0/person gas");
  assert.equal(formatGasSplit(30, "CAD"), "~CA$30/person gas");
});

test("the return is shown in the trip's own zone, like the departure", () => {
  // 4pm Mountain time, written as UTC.
  assert.equal(formatReturn("2026-12-06T23:00:00Z", "America/Denver"), "Back Sun, Dec 6 · 4:00 PM MST");
});

test("long-trip details appear only when set, in reading order", () => {
  assert.deepEqual(carpoolExtras({}), []);
  assert.deepEqual(
    carpoolExtras({ round_trip: true, returns_at: "2026-12-06T23:00:00Z", departs_tz: "America/Denver", gas_split: 40, gas_currency: "USD", stops: " Can pick up in Fort Collins " }),
    ["Round trip · Back Sun, Dec 6 · 4:00 PM MST", "~$40/person gas", "Stops: Can pick up in Fort Collins"],
  );
  assert.deepEqual(carpoolExtras({ round_trip: true }), ["Round trip"], "return time left open");
  assert.deepEqual(carpoolExtras({ gas_split: 40, gas_currency: null }), [], "no currency, no gas line");
});

test("carpools say “Confirm seats by”; the countdown is unchanged", () => {
  assert.equal(decideByStatic("2026-11-26", "Carpool"), "Confirm seats by Nov 26");
  assert.deepEqual(decideByInfo("2026-11-26", "2026-11-24", "Carpool"), { text: "Confirm seats by Thu · 2 days left", tone: "soon" });
  assert.deepEqual(decideByInfo("2026-11-26", "2026-11-24", "Trip"), { text: "Decide by Thu · 2 days left", tone: "soon" });
});

test("the More options summary mentions a round trip and the carpool wording", () => {
  const ride = {
    category: "Carpool" as const, visibility: "circles" as const, start_date: "", end_date: "", dates_flexible: false,
    capacity: 3, status: "Booking Soon" as const, decide_by: "2026-11-26", specific_dates: "", origin: "Denver", destination: "Vail", round_trip: true,
  };
  assert.equal(moreOptionsSummary(ride), "Circles · Denver → Vail · round trip · 3 seats · confirm seats by Nov 26");
});
