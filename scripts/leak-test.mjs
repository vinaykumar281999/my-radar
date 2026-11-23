// End-to-end leak test against your Supabase project and a running app.
//   npm run dev            (in another terminal)
//   node --env-file=.env.local scripts/leak-test.mjs [http://localhost:3000]
//
// Creates three throwaway users (owner, member, outsider) with emails like
// radar-leaktest-<random>@example.com, checks that unlisted and circle plans
// never show up where they shouldn't, then deletes the users and everything
// they own (profiles, plans, circles cascade). Needs SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = (process.argv[2] ?? process.env.LEAK_TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).");
  process.exit(2);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = randomBytes(4).toString("hex");
const SECRET = `SECRET-${tag}`;
const UNLISTED = `UNLISTED-${tag}`;
const password = randomBytes(18).toString("base64url");
let failures = 0;

function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function makeUser(role) {
  const email = `radar-leaktest-${tag}-${role}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  const username = `lt_${tag}_${role}`;
  const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, username, display_name: `Leak ${role}` });
  if (pErr) throw new Error(`profile ${role}: ${pErr.message}`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`sign in ${role}: ${sErr.message}`);
  return { id: data.user.id, username, client };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  return { status: res.status, type: res.headers.get("content-type") ?? "", body: Buffer.from(await res.arrayBuffer()) };
}

/**
 * React Flight (the RSC payload in self.__next_f.push([1,"…"]) scripts) names
 * its rows with hex ids from a counter. In dev, React also spends ids on debug
 * bookkeeping for async work, and how many it spends depends on timing, so the
 * same content can come out as row 154 in one render and 157 in the next.
 *
 * This joins the payload chunks (chunk boundaries are just streaming) and
 * renames only Flight ids, in order of first appearance: row definitions at the
 * start of a payload line, and reference strings like "$154", "$L155" or
 * "$9d:props:children". Everything else, including all text, is untouched.
 * User strings that start with "$" are escaped to "$$…" by React, so they never
 * look like references and can't be renamed.
 */
const FLIGHT_PUSH = /<script>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g;
const FLIGHT_ID = /^([0-9a-f]+):|"\$([L@FQWKBTYh]?)([0-9a-f]+)((?::[^"]*)?)"/gm;

function canonicalFlight(html) {
  let payload = "";
  const rest = html.replace(FLIGHT_PUSH, (_, chunk) => {
    payload += JSON.parse(chunk);
    return "";
  });
  const ids = new Map();
  const canon = (id) => {
    if (!ids.has(id)) ids.set(id, `r${ids.size}`);
    return ids.get(id);
  };
  // Definitions and references in one pass, so names follow document order.
  const renamed = payload.replace(FLIGHT_ID, (_, rowId, prefix, refId, path) =>
    rowId ? `${canon(rowId)}:` : `"$${prefix}${canon(refId)}${path}"`,
  );
  return `${rest}\n<!-- flight -->\n${renamed}`;
}

// Strip what legitimately differs between two renders of the same page.
const normalize = (html) =>
  canonicalFlight(html.toString("utf8"))
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/"buildId":"[^"]*"/g, "")
    .replace(/nonce="[^"]*"/g, "")
    // Next's random per-request render id (differs on every request).
    .replace(/self\.__next_r="[^"]*"/g, "");

// Profile filters are applied only in the browser; the server never reads the
// query string. The one thing allowed to differ is Next echoing the requested
// URL itself (in its router payload), so strip exactly that query string.
const FILTER_QS = "category=Trip";
const stripQuery = (html) =>
  html
    // Router tree key for the page segment, e.g. __PAGE__?{\"category\":\"Trip\"} (any escaping).
    .replace(/__PAGE__\?\{[^}]*\}/g, "__PAGE__")
    .split(`?${FILTER_QS}`).join("")
    .split(FILTER_QS).join("");

/** First differing position, compared by UTF-16 unit on both sides, with ~80 chars of context around it. */
function firstDiff(a, b) {
  let at = 0;
  const end = Math.min(a.length, b.length);
  while (at < end && a.charCodeAt(at) === b.charCodeAt(at)) at++;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, at - 40), at + 40));
  dumpDiff(a, b);
  return `first difference at ${at} of ${a.length}/${b.length}:\n        A: ${ctx(a)}\n        B: ${ctx(b)}`;
}

// LEAK_TEST_DUMP=<dir>: write both sides of every failed comparison, for a full diff.
let dumps = 0;
function dumpDiff(a, b) {
  const dir = process.env.LEAK_TEST_DUMP;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  dumps++;
  writeFileSync(`${dir}/${dumps}-a.html`, a);
  writeFileSync(`${dir}/${dumps}-b.html`, b);
}

const users = [];
try {
  const res = await fetch(`${BASE}/login`).catch(() => null);
  if (!res?.ok) throw new Error(`App not reachable at ${BASE}. Start it with npm run dev.`);

  const owner = await makeUser("owner");
  const member = await makeUser("member");
  const outsider = await makeUser("outsider");
  users.push(owner, member, outsider);

  const { data: pub, error: pubErr } = await owner.client
    .from("plans")
    .insert({ user_id: owner.id, title: `Public ${tag}`, category: "Trip", timeframe: "This Month" })
    .select()
    .single();
  if (pubErr) throw new Error(`public plan: ${pubErr.message}`);

  // ---- Snapshot signed-out output BEFORE any private plans exist ----
  const before = {
    page: await get(`/${owner.username}`),
    og: await get(`/${owner.username}/opengraph-image`),
    missingLink: await get(`/${owner.username}/p/${randomUUID()}`),
    filtered: await get(`/${owner.username}?${FILTER_QS}`),
  };
  check("public page renders", before.page.status === 200, `HTTP ${before.page.status}`);
  check("OG image renders", before.og.type.startsWith("image/"), before.og.type);
  {
    const [plain, filtered] = [stripQuery(normalize(before.page.body)), stripQuery(normalize(before.filtered.body))];
    check(`signed-out profile identical with vs without ?${FILTER_QS} (no private plans yet)`, plain === filtered, plain === filtered ? "" : firstDiff(plain, filtered));
  }

  // ---- Add unlisted + circle plans and a circle with one member ----
  const { data: unl } = await owner.client
    .from("plans")
    .insert({ user_id: owner.id, title: UNLISTED, category: "Trip", timeframe: "This Month", visibility: "unlisted" })
    .select()
    .single();
  const { data: sec } = await owner.client
    .from("plans")
    .insert({ user_id: owner.id, title: SECRET, category: "Trip", timeframe: "This Weekend", notes: SECRET })
    .select()
    .single();
  const { data: circle } = await owner.client.from("circles").insert({ owner_id: owner.id, name: `Circle ${tag}` }).select().single();
  await owner.client.from("circle_members").insert({ circle_id: circle.id, user_id: member.id });
  const { error: audErr } = await owner.client.rpc("set_plan_audience", {
    p_plan_id: sec.id,
    p_visibility: "circles",
    p_circle_ids: [circle.id],
  });
  if (audErr) throw new Error(`set_plan_audience: ${audErr.message}`);

  // A date poll on the circle plan, added before the "after" snapshot so the
  // byte comparisons below cover a plan with a poll too. (If the live database
  // doesn't have the poll schema yet, the poll checks are skipped, loudly.)
  const { data: pollOptions, error: pollErr } = await owner.client
    .from("plan_date_options")
    .insert([
      { plan_id: sec.id, owner_id: owner.id, start_date: "2027-01-08", end_date: "2027-01-10" },
      { plan_id: sec.id, owner_id: owner.id, start_date: "2027-01-15" },
    ])
    .select("id");
  const pollSchema = !pollErr;
  if (pollErr && !/plan_date_options|schema cache|does not exist/i.test(pollErr.message)) {
    throw new Error(`poll options: ${pollErr.message}`);
  }

  // ---- Signed-out output must be byte-identical (apart from ids) ----
  const after = {
    page: await get(`/${owner.username}`),
    og: await get(`/${owner.username}/opengraph-image`),
    circleLink: await get(`/${owner.username}/p/${sec.id}`),
    filtered: await get(`/${owner.username}?${FILTER_QS}`),
  };
  const [pb, pa] = [normalize(before.page.body), normalize(after.page.body)];
  check("signed-out profile page identical with vs without private plans", pb === pa, pb === pa ? "" : firstDiff(pb, pa));
  check("profile page never contains the circle/unlisted titles", !pa.includes(SECRET) && !pa.includes(UNLISTED));
  {
    const fa = normalize(after.filtered.body);
    const [plain, filtered] = [stripQuery(pa), stripQuery(fa)];
    check(`signed-out profile identical with vs without ?${FILTER_QS} (with private plans)`, plain === filtered, plain === filtered ? "" : firstDiff(plain, filtered));
    const fb = stripQuery(normalize(before.filtered.body));
    check(`signed-out ?${FILTER_QS} profile identical before vs after private plans`, fb === filtered, fb === filtered ? "" : firstDiff(fb, filtered));
    check(`?${FILTER_QS} profile never contains the circle/unlisted titles`, !fa.includes(SECRET) && !fa.includes(UNLISTED));
    // The server never applies filters: no chip is pressed in its HTML, and the
    // only place the query string may appear is Next echoing the URL.
    check(`?${FILTER_QS} server HTML has no active filter chip`, !fa.includes('aria-pressed="true"'));
    const echoes = (fa.match(/category=Trip|__PAGE__\?\{/g) ?? []).length;
    console.log(`      (Next echoed the query string ${echoes} time(s); those are stripped before comparing)`);
  }
  check("OG image identical with vs without private plans", before.og.body.equals(after.og.body));
  const [mb, ma] = [normalize(before.missingLink.body), normalize(after.circleLink.body)];
  check("signed-out circle plan link identical to a nonexistent plan link", mb === ma, mb === ma ? "" : firstDiff(mb, ma));
  check("circle plan link never contains its title", !ma.includes(SECRET));

  // ---- Story export uses the same anon data + allowlist (unit-tested); spot-check the data ----
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: anonPlans } = await anon.from("plans").select("title").eq("user_id", owner.id);
  check("anon lists only the public plan", JSON.stringify(anonPlans?.map((p) => p.title)) === JSON.stringify([pub.title]));

  // ---- Member vs outsider ----
  const { data: memberShared } = await member.client.rpc("get_shared_plans", { p_owner_id: owner.id });
  check("member sees the circle plan", memberShared?.length === 1 && memberShared[0].title === SECRET);
  const { data: outsiderShared } = await outsider.client.rpc("get_shared_plans", { p_owner_id: owner.id });
  check("outsider sees nothing shared", Array.isArray(outsiderShared) && outsiderShared.length === 0);
  const { data: outsiderPlan } = await outsider.client.rpc("get_shared_plan", { p_plan_id: sec.id });
  check("outsider gets null for the circle plan id", outsiderPlan === null);

  // ---- Date poll on the circle plan: counts only for members, votes only from members ----
  if (!pollSchema) {
    console.log("SKIP  date-poll checks: the live database doesn't have plan_date_options yet (run supabase/schema.sql)");
  } else {
    const pollFor = (client) => client.rpc("plan_poll", { p_plan_ids: [sec.id] });
    const [anonPoll, outsiderPoll, memberPoll] = await Promise.all([pollFor(anon), pollFor(outsider.client), pollFor(member.client)]);
    check("anon gets no poll for the circle plan", !anonPoll.error && anonPoll.data?.length === 0, anonPoll.error?.message);
    check("outsider gets no poll for the circle plan", !outsiderPoll.error && outsiderPoll.data?.length === 0, outsiderPoll.error?.message);
    check("member sees the circle plan's poll", memberPoll.data?.length === 2, memberPoll.error?.message ?? `${memberPoll.data?.length} rows`);
    const keys = [...new Set((memberPoll.data ?? []).flatMap((r) => Object.keys(r)))].sort().join(",");
    check("poll counts carry no names or contacts", keys === "end_date,option_id,plan_id,start_date,votes", keys);

    const vote = (user_id, plan = sec.id) =>
      admin.rpc("cast_poll_vote", { p_plan_id: plan, p_option_ids: [pollOptions[0].id], p_name: "Leak voter", p_contact: "@leakvoter", p_user_id: user_id });
    const [voteSignedOut, voteOutsider, voteMissing] = await Promise.all([vote(null), vote(outsider.id), vote(null, randomUUID())]);
    check("signed-out vote on a circle plan refused", !!voteSignedOut.error?.message.includes("plan_unavailable"), voteSignedOut.error?.message);
    check("outsider vote on a circle plan refused", !!voteOutsider.error?.message.includes("plan_unavailable"), voteOutsider.error?.message);
    check("…with the same error as a missing plan", !!voteMissing.error?.message.includes("plan_unavailable"), voteMissing.error?.message);
    const voteMember = await vote(member.id);
    check("member vote on a circle plan accepted", !voteMember.error, voteMember.error?.message);

    const { data: afterVote } = await pollFor(member.client);
    check("member sees the vote counted", afterVote?.find((r) => r.option_id === pollOptions[0].id)?.votes === 1);
    const { data: ownerBallots } = await owner.client.from("plan_poll_ballots").select("voter_name").eq("plan_id", sec.id);
    check("owner sees who voted", ownerBallots?.length === 1 && ownerBallots[0].voter_name === "Leak voter");
    const { data: outsiderBallots } = await outsider.client.from("plan_poll_ballots").select("voter_name");
    check("outsider sees no ballots", Array.isArray(outsiderBallots) && outsiderBallots.length === 0);
    const anonBallots = await anon.from("plan_poll_ballots").select("voter_name");
    check("anon can't read ballots", !!anonBallots.error || anonBallots.data?.length === 0, anonBallots.error?.message);
    const anonCast = await anon.rpc("cast_poll_vote", { p_plan_id: sec.id, p_option_ids: [pollOptions[0].id], p_name: "x", p_contact: "@x", p_user_id: null });
    check("anon can't call cast_poll_vote directly", anonCast.error?.code === "42501", anonCast.error?.message);
  }

  // ---- Copy to my Radar ----
  for (const [label, source] of [["circle", sec.id], ["unlisted", unl.id]]) {
    const { error } = await member.client
      .from("plans")
      .insert({ user_id: member.id, title: "copy", category: "Trip", timeframe: "This Month", chained_from_plan_id: source });
    check(`copy of a ${label} plan refused`, !!error?.message.includes("copy_source_unavailable"), error?.message ?? "insert succeeded!");
  }

  // ---- iCal: a member's feed never includes someone else's plans ----
  const { data: token } = await member.client.rpc("regenerate_calendar_token");
  const feed = await get(`/api/ical/${token}.ics`);
  check("member's iCal feed responds", feed.status === 200, `HTTP ${feed.status}`);
  check("member's iCal feed has no circle/unlisted plans of others", !feed.body.toString().includes(SECRET) && !feed.body.toString().includes(UNLISTED));

  // ---- Interest submissions (the server action inserts with the service role; guard_interest decides) ----
  const interest = (user_id) =>
    admin.from("interests").insert({ plan_id: sec.id, visitor_name: "Leak test", contact_handle: "@leaktest", user_id });
  const [signedOut, outsiderTry, missing] = await Promise.all([
    interest(null),
    interest(outsider.id),
    admin.from("interests").insert({ plan_id: randomUUID(), visitor_name: "x", contact_handle: "@x" }),
  ]);
  check("signed-out interest on a circle plan refused", !!signedOut.error?.message.includes("plan_unavailable"), signedOut.error?.message);
  check("outsider interest on a circle plan refused", !!outsiderTry.error?.message.includes("plan_unavailable"), outsiderTry.error?.message);
  check("…with the same error as a missing plan", !!missing.error?.message.includes("plan_unavailable"), missing.error?.message);
  const memberTry = await interest(member.id);
  check("member interest on a circle plan accepted", !memberTry.error, memberTry.error?.message);
} catch (err) {
  failures++;
  console.error(`ERROR  ${err.message}`);
} finally {
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.error(`cleanup: couldn't delete ${u.username}: ${error.message}`);
  }
  console.log(users.length ? `\nCleaned up ${users.length} test users and their data.` : "");
}

console.log(failures ? `${failures} check(s) failed` : "All leak checks passed");
process.exit(failures ? 1 : 0);
