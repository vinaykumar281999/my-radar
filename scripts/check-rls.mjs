// Anon-key checks against the live Supabase project. Read-only: every write it
// attempts is expected to be rejected, so it never leaves data behind.
//   node --env-file=.env.local scripts/check-rls.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const ZERO = "00000000-0000-0000-0000-000000000000";
let failures = 0;

function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}
const describe = (r) => (r.error ? `${r.error.code} ${r.error.message}` : `ok, ${r.data?.length ?? r.count ?? 0} rows`);
const denied = (r) => r.error?.code === "42501";
/** The privilege itself was revoked (not just an RLS row check that a real target could pass). */
const revoked = (r) => denied(r) && /permission denied/i.test(r.error.message);
/** Either no privilege at all, or RLS hides every row. */
const unreadable = (r) => denied(r) || (!r.error && r.data.length === 0);

// --- Schema present -----------------------------------------------------------
let r = await sb
  .from("plans")
  .select("suggested_by_handle, chained_from_plan_id, visibility, start_date, end_date, dates_flexible, capacity, origin, destination, departs_at, departs_tz, round_trip, returns_at, gas_split, gas_currency, stops, decide_by")
  .limit(1);
check("plans has chain, visibility, date (incl. dates_flexible), spots and carpool columns", !r.error, r.error?.message);
r = await sb.from("interests").select("status, user_id, can_drive, large_bag, promoted_at").limit(1);
check("interests has status, user_id, rider flags and promoted_at", denied(r) || !r.error, describe(r));
r = await sb.from("profiles").select("pitches_paused").limit(1);
check("profiles has pitches_paused", !r.error, r.error?.message);

// --- Public submissions only go through the server ------------------------------
const pitch = { target_user_id: ZERO, title: "RLS check", category: "Trip", timeframe: "This Month", pitcher_name: "RLS check", pitcher_handle: "@rls_check" };
r = await sb.from("plan_pitches").insert(pitch);
check("anon INSERT on plan_pitches is revoked", revoked(r), describe(r));
r = await sb.from("interests").insert({ plan_id: ZERO, visitor_name: "RLS check", contact_handle: "@rls_check" });
check("anon INSERT on interests is revoked", revoked(r), describe(r));
r = await sb.from("plans").insert({ user_id: ZERO, title: "x", category: "Trip", timeframe: "This Month" });
check("anon cannot insert plans", denied(r), describe(r));

// Poll counts are public on purpose (same visibility as the plan, no names): anon may
// call plan_poll, and gets nothing for a plan it can't see.
r = await sb.rpc("plan_poll", { p_plan_ids: [ZERO] });
check("plan_poll exists; anon gets no rows for an unknown plan", !r.error && Array.isArray(r.data) && r.data.length === 0, describe(r));

// --- Private tables stay private ------------------------------------------------
for (const table of [
  "plan_pitches",
  "interests",
  "blocked_contacts",
  "calendar_feeds",
  "username_history",
  "rate_limit_hits",
  "circles",
  "circle_members",
  "circle_invites",
  "plan_audiences",
  "plan_private_details",
  "circle_settings",
  "promotion_notice_seen",
  "plan_date_options",
  "plan_poll_ballots",
  "plan_poll_choices",
]) {
  r = await sb.from(table).select("*").limit(5);
  check(`anon cannot read ${table}`, unreadable(r), describe(r));
}
r = await sb.from("plans").select("id").in("visibility", ["unlisted", "circles"]).limit(5);
check("anon cannot list unlisted or circle plans", unreadable(r), describe(r));

// --- Functions: signed-in / server only ----------------------------------------
const rpcDenied = [
  ["accept_pitch", { p_pitch_id: ZERO, p_suggested_by: "x" }],
  ["block_contact", { p_contact: "@rls_check" }],
  ["regenerate_calendar_token", {}],
  ["consume_rate_limit", { p_bucket: "rls_check", p_limit: 1, p_window_seconds: 1 }],
  ["can_user_see_plan", { p_plan_id: ZERO, p_user_id: ZERO }],
  ["get_shared_plans", { p_owner_id: ZERO }],
  ["get_shared_plan", { p_plan_id: ZERO }],
  ["preview_visible_plans", { p_member_id: null }],
  ["set_plan_audience", { p_plan_id: ZERO, p_visibility: "public", p_circle_ids: [] }],
  ["redeem_circle_invite", { p_token: "rls_check" }],
  ["approve_spot", { p_interest_id: ZERO }],
  ["decline_spot", { p_interest_id: ZERO }],
  ["create_circle_invite", { p_circle_id: ZERO, p_days: 7, p_max_uses: 1 }],
  ["promote_waitlist", { p_plan_id: ZERO }],
  ["my_waitlist_position", { p_plan_id: ZERO }],
  ["cast_poll_vote", { p_plan_id: ZERO, p_option_ids: [ZERO], p_name: "x", p_contact: "@x", p_user_id: null }],
  ["pick_date_option", { p_option_id: ZERO }],
  ["poll_stale_ballots", { p_plan_id: ZERO }],
  ["my_promotion_notices", {}],
  ["dismiss_promotion_notice", { p_interest_id: ZERO }],
];
for (const [fn, args] of rpcDenied) {
  r = await sb.rpc(fn, args);
  check(`${fn} exists, anon cannot execute`, denied(r), describe(r));
}

// --- Functions anon may call -------------------------------------------------------
// Signed-out availability checks go through the app's rate-limited server action instead.
r = await sb.rpc("username_available", { p_username: "zz_rls_check_zz" });
check("username_available exists, anon cannot execute", denied(r), describe(r));
// Callable by anyone on purpose (check constraints run it as the inserting user); it only reveals the public list.
r = await sb.rpc("is_reserved_username", { p_username: "demo" });
check("is_reserved_username exists and says demo is reserved", !r.error && r.data === true, describe(r));
r = await sb.rpc("resolve_username", { p_username: "zz_rls_check_zz" });
check("resolve_username works for anon (unknown name -> null)", !r.error && r.data === null, describe(r));
r = await sb.rpc("get_public_plan", { p_plan_id: ZERO });
check("get_public_plan works for anon (unknown id -> no rows)", !r.error && r.data.length === 0, describe(r));
r = await sb.rpc("get_invite_preview", { p_token: "rls_check" });
check("get_invite_preview reveals nothing for a bad token", !r.error && r.data?.status === "invalid", describe(r));
r = await sb.rpc("plan_spots", { p_plan_ids: [ZERO] });
check("plan_spots works for anon (unknown id -> no rows)", !r.error && r.data.length === 0, describe(r));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
