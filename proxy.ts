import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_USERNAMES } from "@/lib/types";
import { safeNext } from "@/lib/safe-next";

const PROTECTED = ["/dashboard", "/onboarding", "/settings"];

/** "/name" or "/name/p/<plan id>" — a public page that may be under an old username. */
const PUBLIC_PAGE = /^\/([A-Za-z0-9_]{3,30})(\/p\/[^/]+)?\/?$/;

/**
 * Next.js 16 Proxy (formerly middleware):
 * - public pages: 308 from a renamed user's old username to their current one
 * - everything else matched: refreshes the Supabase auth session cookie and
 *   gates the signed-in-only routes
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  const page = PUBLIC_PAGE.exec(pathname);
  if (page && !RESERVED_USERNAMES.has(page[1].toLowerCase())) {
    // Done here rather than in the page: the page streams, so a redirect there
    // would arrive as a 200 + client-side redirect instead of a real 308.
    const current = await resolveUsername(url, key, page[1].toLowerCase());
    if (current && current !== page[1].toLowerCase()) {
      const target = request.nextUrl.clone();
      target.pathname = `/${current}${page[2] ?? ""}`;
      return NextResponse.redirect(target, 308);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Don't put code between createServerClient and getUser — it revalidates the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Keep the query (e.g. /onboarding?next=/join/...) so the round trip lands in the same place.
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectWithCookies(loginUrl, response);
  }

  if (user && pathname === "/login") {
    // Already signed in: go where the login was headed (e.g. back to an invite link).
    const target = new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url);
    return redirectWithCookies(target, response);
  }

  return response;
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

// Short per-instance cache so popular pages don't hit the database on every view.
// A rename can take up to a minute to start redirecting on a warm instance.
const RESOLVE_TTL_MS = 60_000;
const resolved = new Map<string, { current: string | null; expires: number }>();

async function resolveUsername(url: string, key: string, username: string): Promise<string | null> {
  const hit = resolved.get(username);
  if (hit && hit.expires > Date.now()) return hit.current;

  try {
    const res = await fetch(`${url}/rest/v1/rpc/resolve_username`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_username: username }),
      signal: AbortSignal.timeout(2000),
    });
    // Fail open: if the lookup breaks, render the page as usual (not found).
    if (!res.ok) return null;
    const current = (await res.json()) as string | null;
    if (resolved.size > 1000) resolved.clear();
    resolved.set(username, { current, expires: Date.now() + RESOLVE_TTL_MS });
    return current;
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    // Auth-aware routes.
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/settings/:path*",
    "/login",
    "/auth/:path*",
    // Invite links: refresh the session so a signed-in visitor is recognized.
    "/join/:path*",
    // Public pages, only for the old-username redirect (no auth work there).
    "/:username([A-Za-z0-9_]{3,30})",
    "/:username([A-Za-z0-9_]{3,30})/p/:id",
  ],
};
