import assert from "node:assert/strict";
import { USERNAME_CHECK_LIMIT, USERNAME_CHECK_WINDOW_SECONDS, decideUsernameCheck } from "@/lib/username-check";

/** Fake I/O that records what was used. */
function fake({ signedIn = false, allowed = true as boolean | null, available = true as boolean | null } = {}) {
  const calls: string[] = [];
  return {
    calls,
    io: {
      signedIn,
      consume: async () => {
        calls.push("consume");
        return allowed;
      },
      lookup: async (asUser: boolean) => {
        calls.push(asUser ? "lookup as user" : "lookup as server");
        return available;
      },
    },
  };
}

test("the limit is generous: about one check a second for a minute", () => {
  assert.equal(USERNAME_CHECK_LIMIT, 60);
  assert.equal(USERNAME_CHECK_WINDOW_SECONDS, 60);
});

test("malformed and reserved names never reach the limiter or the database", async () => {
  for (const name of ["ab", "has space", "demo", "dashboard", ""]) {
    const f = fake();
    assert.equal(await decideUsernameCheck(name, f.io), "invalid", name);
    assert.deepEqual(f.calls, [], name);
  }
});

test("signed out: one limiter hit, then a server-side lookup", async () => {
  const f = fake({ available: true });
  assert.equal(await decideUsernameCheck("maya", f.io), "available");
  assert.deepEqual(f.calls, ["consume", "lookup as server"]);
  const t = fake({ available: false });
  assert.equal(await decideUsernameCheck("maya", t.io), "taken");
});

test("signed out and over the limit: no lookup at all", async () => {
  const f = fake({ allowed: false });
  assert.equal(await decideUsernameCheck("maya", f.io), "rate_limited");
  assert.deepEqual(f.calls, ["consume"]);
});

test("signed in (onboarding, settings): no limiter, lookup runs as the user", async () => {
  const f = fake({ signedIn: true });
  assert.equal(await decideUsernameCheck("maya", f.io), "available");
  assert.deepEqual(f.calls, ["lookup as user"]);
});

test("failures are reported as errors, not as taken or available", async () => {
  assert.equal(await decideUsernameCheck("maya", fake({ allowed: null }).io), "error");
  assert.equal(await decideUsernameCheck("maya", fake({ available: null }).io), "error");
});
