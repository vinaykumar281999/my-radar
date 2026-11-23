import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/** The caller's IP as the hosting proxy reports it (Vercel sets x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Rate-limit buckets store a keyed hash, never the raw IP. */
export function hashIp(ip: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "radar").update(ip).digest("base64url").slice(0, 32);
}
