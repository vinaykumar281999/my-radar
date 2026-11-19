import assert from "node:assert/strict";
import { safeNext } from "@/lib/safe-next";
import { applyFilters, filtersToSearch, hasFilters, parseFilters } from "@/lib/feed-filters";

test("a filtered profile path survives safeNext unchanged", () => {
  const next = "/alex?category=Trip&status=Locked+In";
  assert.equal(safeNext(next), next);
  // What SharedSignInPrompt sends through /login?next=… and back.
  assert.equal(safeNext(decodeURIComponent(encodeURIComponent(next))), next);
});

test("safeNext still rejects other origins", () => {
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "//evil.com/alex?category=Trip"]) {
    assert.equal(safeNext(bad), "/dashboard", bad);
  }
});

test("filters parse only known values and round-trip through the URL", () => {
  const f = parseFilters(new URLSearchParams("category=Trip&status=Locked+In"));
  assert.deepEqual(f, { category: "Trip", status: "Locked In" });
  assert.deepEqual(parseFilters(new URLSearchParams("category=<script>&status=nope")), { category: null, status: null });
  assert.equal(hasFilters(parseFilters(null)), false);
  assert.equal(filtersToSearch("?ref=ig", f), "?ref=ig&category=Trip&status=Locked+In");
  assert.equal(filtersToSearch("?category=Trip", { category: null, status: null }), "");
});

test("filters apply to every plan the viewer can see", () => {
  const plans = [
    { id: "pub", category: "Trip" as const, status: "Locked In" as const },
    { id: "shared", category: "Trip" as const, status: "Just an Idea" as const },
    { id: "gig", category: "Concert" as const, status: "Locked In" as const },
  ];
  assert.deepEqual(applyFilters(plans, { category: "Trip", status: null }).map((p) => p.id), ["pub", "shared"]);
  assert.deepEqual(applyFilters(plans, { category: "Trip", status: "Locked In" }).map((p) => p.id), ["pub"]);
  assert.deepEqual(applyFilters(plans, { category: "Sports", status: null }), []);
});
