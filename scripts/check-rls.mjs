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
let r = await sb.from("plans").select("suggested_by_handle, chained_from_plan_id, visibility, start_date, end_date").limit(1);
check("plans has Plan Chain, visibility and date columns", !r.error, r.error?.message);
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

// --- Private tables stay private ------------------------------------------------
for (const table of ["plan_pitches", "interests", "blocked_contacts", "calendar_feeds", "username_history", "rate_limit_hits"]) {
  r = await sb.from(table).select("*").limit(5);
  check(`anon cannot read ${table}`, unreadable(r), describe(r));
}
r = await sb.from("plans").select("id").eq("visibility", "unlisted").limit(5);
check("anon cannot list unlisted plans", unreadable(r), describe(r));

// --- Functions: signed-in / server only ----------------------------------------
const rpcDenied = [
  ["accept_pitch", { p_pitch_id: ZERO, p_suggested_by: "x" }],
  ["block_contact", { p_contact: "@rls_check" }],
  ["regenerate_calendar_token", {}],
  ["consume_rate_limit", { p_bucket: "rls_check", p_limit: 1, p_window_seconds: 1 }],
];
for (const [fn, args] of rpcDenied) {
  r = await sb.rpc(fn, args);
  check(`${fn} exists, anon cannot execute`, denied(r), describe(r));
}

// --- Functions anon may call -------------------------------------------------------
r = await sb.rpc("username_available", { p_username: "zz_rls_check_zz" });
check("username_available works for anon", !r.error && r.data === true, describe(r));
r = await sb.rpc("resolve_username", { p_username: "zz_rls_check_zz" });
check("resolve_username works for anon (unknown name -> null)", !r.error && r.data === null, describe(r));
r = await sb.rpc("get_public_plan", { p_plan_id: ZERO });
check("get_public_plan works for anon (unknown id -> no rows)", !r.error && r.data.length === 0, describe(r));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
