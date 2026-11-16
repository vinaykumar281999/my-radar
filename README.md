# Radar 📡

A link-in-bio for your upcoming plans. Share `yourdomain.com/username` and friends tap **I'm Interested 👋** before you book.

**Stack:** Next.js 16 (App Router, Cache Components, `proxy.ts`) · Tailwind CSS v4 · shadcn/ui (Base UI) · Supabase (Auth + Postgres + RLS) · `next/og` · `html-to-image`

## Setup

1. **Install:** `npm install`
2. **Env:** `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).
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

## Notes

- `proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the Supabase session cookie and gates `/dashboard` and `/onboarding`.
- Cache Components is on, so anything that reads cookies or `params` sits behind a `<Suspense>` boundary with a skeleton fallback.
- All writes go straight from the browser to Supabase. Row-level security is the authorization layer: anyone can submit interest in an active plan, and only the plan owner can read or delete those submissions.
- Usernames that collide with app routes (`login`, `dashboard`, …) are rejected by both the database and the UI.
