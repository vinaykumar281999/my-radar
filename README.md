# Radar 📡

A link-in-bio for your upcoming plans. Share `yourdomain.com/username` and friends tap **I'm Interested 👋** before you book.

**Stack:** Next.js 16 (App Router, Cache Components, `proxy.ts`) · Tailwind CSS v4 · shadcn/ui (Base UI) · Supabase (Auth + Postgres + RLS) · `next/og` · `html-to-image`

## Setup

1. **Install:** `npm install`
2. **Env:** `cp .env.example .env.local` and fill in:

   | Variable | Where | Required |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same page, the `service_role` / secret key. **Server-only: never prefix with `NEXT_PUBLIC_`.** | yes (interest, pitches, calendar feed) |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile → add a widget in **Invisible** mode | production (skipped in dev when unset; submissions are rejected in production without the secret) |
   | `NEXT_PUBLIC_SITE_URL` | Your public URL | optional |
3. **Database:** paste `supabase/schema.sql` into the Supabase SQL editor and run it. It is safe to re-run.
4. **Auth redirects:** in Supabase → Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` (your production domain later)
   - Redirect URLs: add `http://localhost:3000/auth/callback` (and `https://yourdomain.com/auth/callback`)
5. **Run:** `npm run dev` → http://localhost:3000

Magic link and email/password both work. If "Confirm email" is on in Supabase, password sign-ups get a confirmation email that lands on `/auth/callback`.

## Routes

| Route | What it does |
| --- | --- |
| `/` | Landing page with an interactive demo profile |
| `/login` | Magic link or email/password |
| `/auth/callback` | Exchanges the email link (`?code=` or `?token_hash=`) for a session |
| `/onboarding` | Claim username, display name, bio (first login only) |
| `/dashboard` | Copy bio link, preview, story card, quick-add, status toggles, leads |
| `/[username]` | Public bio page with the zero-login interest drawer |
| `/[username]/opengraph-image` | Dynamic 1200×630 preview card (name + top 3 plans) |
| `/[username]/p/[planId]` | Direct link to one plan (the only way to see an **unlisted** plan) |
| `/settings` | Change username / name / bio, pause pitches, blocked senders, calendar feed |
| `/api/ical/[token].ics` | Private iCal feed of your dated plans (secret token, regenerable) |

## Notes

- `proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the Supabase session cookie, gates `/dashboard`, `/onboarding` and `/settings`, and 308-redirects old usernames to the current one (the page itself streams, so it can't send a real 308).
- Cache Components is on, so anything that reads cookies or `params` sits behind a `<Suspense>` boundary with a skeleton fallback.
- Owner writes go straight from the browser to Supabase, with row-level security as the authorization layer.
- Public submissions (“I'm Interested”, pitches) go through server actions in `lib/actions/submit.ts`: honeypot → Turnstile → per-IP limit (20 per 10 minutes, hashed IP) → insert with the service-role key. Anon INSERT on those tables is revoked, and database triggers enforce the per-person pitch cap, paused pitches and blocked senders.
- `node --env-file=.env.local scripts/check-rls.mjs` runs read-only anon checks against your project.
- `npm run test:unit` runs the pure-logic tests in `tests/unit/` (who-sees-what rules, dates, .ics, CSV).
- `npm run test:db` runs `supabase/schema.sql` (fresh + re-run) and the SQL tests in `supabase/tests/` against a throwaway local Postgres, acting as anon, signed-in users and the service role. Needs PostgreSQL 15+ tools on PATH (`brew install postgresql@15`).
- Usernames that collide with app routes (`login`, `dashboard`, …) are rejected by both the database and the UI.
