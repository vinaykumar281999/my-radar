"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { PITCH_CATEGORIES, TIMEFRAMES, type Category, type Timeframe } from "@/lib/types";

export type SubmitError =
  | "invalid"
  | "verification_failed"
  | "rate_limited"
  | "too_many_pitches"
  | "pitches_paused"
  | "plan_unavailable"
  | "plan_full"
  | "sign_in_required"
  | "server";

export type SubmitResult = { ok: true } | { ok: false; error: SubmitError };

/**
 * Shared by both forms: at most this many submissions per IP per window.
 * Generous on purpose: Turnstile stops bots, and many real people share an IP
 * (same Wi-Fi, mobile carrier NAT). The value is passed to consume_rate_limit(),
 * so changing it needs no schema change.
 */
const IP_LIMIT = 20;
const IP_WINDOW_SECONDS = 10 * 60;

type Common = {
  /** Honeypot field: humans leave it empty. */
  website?: string;
  turnstileToken: string | null;
};

export type InterestInput = Common & {
  planId: string;
  name: string;
  contact: string;
  message: string;
  /** Carpool seat requests only; guard_interest clears them on other plans. */
  canDrive?: boolean;
  largeBag?: boolean;
};

export type PitchInput = Common & {
  targetUserId: string;
  title: string;
  category: Category;
  timeframe: Timeframe;
  name: string;
  contact: string;
  notes: string;
};

export async function submitInterest(input: InterestInput): Promise<SubmitResult> {
  const planId = uuid(input.planId);
  const name = text(input.name, 60);
  const contact = text(input.contact, 60);
  const message = text(input.message, 280);
  if (!planId || !name || !contact) return fail("invalid");

  return guarded(input, async (db) => {
    // Who is sending, from their own session (never from the request body).
    // Circle plans only accept signed-in members: guard_interest checks this
    // user against the plan's circles and answers plan_unavailable otherwise,
    // the same as for a plan that doesn't exist.
    const userId = await signedInProfileId(db);
    return db.from("interests").insert({
      plan_id: planId,
      visitor_name: name,
      contact_handle: contact,
      message,
      user_id: userId,
      can_drive: input.canDrive === true,
      large_bag: input.largeBag === true,
    });
  });
}

export async function submitPitch(input: PitchInput): Promise<SubmitResult> {
  const targetUserId = uuid(input.targetUserId);
  const title = text(input.title, 80);
  const name = text(input.name, 60);
  const contact = text(input.contact, 60);
  const notes = text(input.notes, 140);
  const category = (PITCH_CATEGORIES as readonly string[]).includes(input.category) ? input.category : null;
  const timeframe = (TIMEFRAMES as readonly string[]).includes(input.timeframe) ? input.timeframe : null;
  if (!targetUserId || !title || !name || !contact || !category || !timeframe) return fail("invalid");

  return guarded(input, async (db) =>
    db.from("plan_pitches").insert({
      target_user_id: targetUserId,
      title,
      category,
      timeframe,
      pitcher_name: name,
      pitcher_handle: contact,
      notes,
    }),
  );
}

/** Honeypot → Turnstile → per-IP limit → insert, then map database errors. */
async function guarded(
  input: Common,
  insert: (db: ReturnType<typeof createAdminClient>) => PromiseLike<{ error: { message: string; code?: string } | null }>,
): Promise<SubmitResult> {
  // Bot filled the hidden field: pretend it worked, save nothing.
  if (input.website) return { ok: true };

  const ip = await clientIp();
  if (!(await verifyTurnstile(typeof input.turnstileToken === "string" ? input.turnstileToken : null, ip))) {
    return fail("verification_failed");
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (err) {
    console.error(err);
    return fail("server");
  }

  const { data: allowed, error: limitError } = await db.rpc("consume_rate_limit", {
    p_bucket: `submit:${hashIp(ip ?? "unknown")}`,
    p_limit: IP_LIMIT,
    p_window_seconds: IP_WINDOW_SECONDS,
  });
  if (limitError) {
    console.error("consume_rate_limit", limitError);
    return fail("server");
  }
  if (!allowed) return fail("rate_limited");

  const { error } = await insert(db);
  // Blocked senders get the normal success screen; nothing is saved.
  if (!error || error.message.includes("sender_blocked")) return { ok: true };
  // A signed-in user already sent interest for this plan: nothing new to save.
  if (error.code === "23505" && error.message.includes("interests_plan_user_key")) return { ok: true };

  for (const known of ["too_many_pitches", "pitches_paused", "plan_unavailable", "plan_full", "sign_in_required"] as const) {
    if (error.message.includes(known)) return fail(known);
  }
  // Foreign key: the plan or profile doesn't exist (any more).
  if (error.code === "23503") return fail("plan_unavailable");
  console.error("submission insert", error);
  return fail("server");
}

/** The caller's profile id if they're signed in and onboarded, else null. */
async function signedInProfileId(db: ReturnType<typeof createAdminClient>) {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const { data } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

function fail(error: SubmitError): SubmitResult {
  return { ok: false, error };
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Store a keyed hash, never the raw IP. */
function hashIp(ip: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "radar").update(ip).digest("base64url").slice(0, 32);
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}
