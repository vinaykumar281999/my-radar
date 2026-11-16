// Anon-key checks against the live Supabase project.
//   node --env-file=.env.local scripts/check-rls.mjs              read-only checks
//   node --env-file=.env.local scripts/check-rls.mjs --pitch <username>
//     also inserts ONE test pitch for that profile (dismiss it in the dashboard),
//     then confirms anon can't read, update, or delete it.
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
const denied = (r) => r.error?.code === "42501";

// Schema present
let r = await sb.from("plans").select("suggested_by_handle, chained_from_plan_id").limit(1);
check("plans has Plan Chain columns", !r.error, r.error?.message);
r = await sb.from("plan_pitches").select("id").limit(1);
check("plan_pitches table exists", !r.error, r.error?.message);

// accept_pitch exists but is not callable by anon
r = await sb.rpc("accept_pitch", { p_pitch_id: ZERO, p_suggested_by: "x" });
check("accept_pitch exists, anon cannot execute", denied(r), r.error ? `${r.error.code} ${r.error.message}` : "call succeeded!");

// Anon write rules
const pitch = { target_user_id: ZERO, title: "RLS check", category: "Trip", timeframe: "This Month", pitcher_name: "RLS check", pitcher_handle: "@rls_check" };
check("anon pitch to nonexistent profile is rejected", denied(await sb.from("plan_pitches").insert(pitch)));
check("anon pitch with status=accepted is rejected", denied(await sb.from("plan_pitches").insert({ ...pitch, status: "accepted" })));
check("anon plan insert is rejected", denied(await sb.from("plans").insert({ user_id: ZERO, title: "x", category: "Trip", timeframe: "This Month" })));

// Positive path (opt-in: writes one row)
const i = process.argv.indexOf("--pitch");
if (i > 0) {
  const username = process.argv[i + 1];
  const { data: profile } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
  if (!profile) {
    check(`profile @${username} exists`, false, "sign up and onboard first");
  } else {
    const ins = await sb.from("plan_pitches").insert({ ...pitch, target_user_id: profile.id, title: "[RLS check] safe to dismiss" });
    check("anon can insert a pending pitch for a real profile", !ins.error, ins.error?.message);
    const read = await sb.from("plan_pitches").select("id").eq("target_user_id", profile.id);
    check("anon cannot read pitches", !read.error && read.data.length === 0, `${read.data?.length ?? "?"} rows visible`);
    const upd = await sb.from("plan_pitches").update({ status: "dismissed" }, { count: "exact" }).eq("target_user_id", profile.id);
    check("anon cannot update pitches", upd.count === 0, `${upd.count} rows updated`);
    const del = await sb.from("plan_pitches").delete({ count: "exact" }).eq("target_user_id", profile.id);
    check("anon cannot delete pitches", del.count === 0, `${del.count} rows deleted`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
