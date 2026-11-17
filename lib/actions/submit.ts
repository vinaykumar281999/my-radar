"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { CATEGORIES, TIMEFRAMES, type Category, type Timeframe } from "@/lib/types";

export type SubmitError =
  | "invalid"
  | "verification_failed"
  | "rate_limited"
  | "too_many_pitches"
  | "pitches_paused"
  | "plan_unavailable"
  | "server";

export type SubmitResult = { ok: true } | { ok: false; error: SubmitError };

/** Shared by both forms: at most this many submissions per IP per window. */
const IP_LIMIT = 5;
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

  return guarded(input, async (db) =>
    db.from("interests").insert({ plan_id: planId, visitor_name: name, contact_handle: contact, message }),
  );
}

export async function submitPitch(input: PitchInput): Promise<SubmitResult> {
  const targetUserId = uuid(input.targetUserId);
  const title = text(input.title, 80);
  const name = text(input.name, 60);
  const contact = text(input.contact, 60);
  const notes = text(input.notes, 140);
  const category = (CATEGORIES as readonly string[]).includes(input.category) ? input.category : null;
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
  if (!error) return { ok: true };

  for (const known of ["too_many_pitches", "pitches_paused", "plan_unavailable"] as const) {
    if (error.message.includes(known)) return fail(known);
  }
  // Foreign key: the plan or profile doesn't exist (any more).
  if (error.code === "23503") return fail("plan_unavailable");
  console.error("submission insert", error);
  return fail("server");
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
