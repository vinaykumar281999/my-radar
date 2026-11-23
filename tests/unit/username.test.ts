import assert from "node:assert/strict";
import { claimHref, cleanUsername, handleFromQuery, isValidUsername } from "@/lib/username";
import { safeNext } from "@/lib/safe-next";

test("typing is cleaned to the allowed characters", () => {
  assert.equal(cleanUsername("Maya.Chen!"), "mayachen");
  assert.equal(cleanUsername("a".repeat(40)).length, 30);
});

test("valid means the right shape and not a reserved route", () => {
  assert.equal(isValidUsername("maya_chen"), true);
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("dashboard"), false);
});

test("Claim carries the handle through sign-in to onboarding", () => {
  const href = claimHref("maya");
  assert.equal(href, "/login?next=%2Fonboarding%3Fhandle%3Dmaya");
  // The login page reads ?next= through safeNext; it must survive unchanged.
  const next = new URL(href, "https://radar.app").searchParams.get("next");
  assert.equal(safeNext(next), "/onboarding?handle=maya");
  assert.equal(claimHref(""), "/login", "no handle: plain sign-in");
  assert.equal(claimHref("x"), "/login", "too short: plain sign-in");
  assert.equal(claimHref("settings"), "/login", "reserved: plain sign-in");
});

test("onboarding re-validates the handle from the URL", () => {
  assert.equal(handleFromQuery("maya"), "maya");
  assert.equal(handleFromQuery("Maya"), "maya", "case is harmless");
  assert.equal(handleFromQuery("maya chen"), null, "would have been changed: ignore it");
  assert.equal(handleFromQuery("<script>"), null);
  assert.equal(handleFromQuery("ab"), null);
  assert.equal(handleFromQuery("login"), null);
  assert.equal(handleFromQuery(["maya", "x"]), null);
  assert.equal(handleFromQuery(undefined), null);
});
