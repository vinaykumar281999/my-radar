import { CATEGORY_EMOJI } from "@/components/plan-meta";
import { buildCalendar } from "@/lib/ics";
import { getSiteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Plan, Profile } from "@/lib/types";

const TOKEN_RE = /^[0-9a-f]{64}$/;

/**
 * Private iCal feed: /api/ical/<token>.ics. The token is the only credential
 * (calendar apps can't sign in), so it's 64 random hex chars, regenerable in
 * settings, and looked up with the service role.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/ical/[token]">) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!TOKEN_RE.test(token)) return notFound();

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (err) {
    console.error(err);
    return new Response("Calendar feed is not configured", { status: 503 });
  }

  const { data: feed } = await db
    .from("calendar_feeds")
    .select("user_id")
    .eq("token", token)
    .maybeSingle<{ user_id: string }>();
  if (!feed) return notFound();

  const [{ data: profile }, { data: plans, error }] = await Promise.all([
    db.from("profiles").select("*").eq("id", feed.user_id).maybeSingle<Profile>(),
    db
      .from("plans")
      .select("*")
      .eq("user_id", feed.user_id)
      .eq("is_archived", false)
      .not("start_date", "is", null)
      .order("start_date")
      .returns<Plan[]>(),
  ]);
  if (error || !profile) {
    console.error("ical feed", error);
    return new Response("Couldn't load the calendar", { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ? getSiteUrl() : new URL(request.url).origin;
  const ics = buildCalendar(
    (plans ?? []).map((plan) => ({
      uid: `${plan.id}@radar`,
      title: `${CATEGORY_EMOJI[plan.category]} ${plan.title}`,
      start: plan.start_date!,
      end: plan.end_date,
      description: [plan.notes, `Status: ${plan.status}`, plan.visibility === "unlisted" ? "Unlisted" : null]
        .filter(Boolean)
        .join("\n"),
      url: `${base}/${profile.username}/p/${plan.id}`,
      confirmed: plan.status === "Locked In",
    })),
    `${profile.display_name}'s Radar`,
  );

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="radar.ics"',
      "Cache-Control": "private, max-age=300",
      // The URL is a secret; keep it out of logs/referrers and search engines.
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404 });
}
