# Manual test checklist

Run `npm run dev` and open http://localhost:3000. Use two browsers or a private window for the guest steps.

## 1. Magic-link signup
- [ ] `/login` → **Magic link** tab → enter a new email → "Check your inbox" appears
- [ ] Open the email link → lands on `/auth/callback` → redirected to `/onboarding`
- [ ] Re-using the same link → `/login` shows "That sign-in link expired or was already used"

## 2. Password signup
- [ ] Sign out, `/login` → **Password** tab → new email + 6+ char password → **Create account**
  - If Supabase "Confirm email" is ON: "Check your inbox", then confirm → `/onboarding`
  - If OFF: goes straight to `/onboarding`
- [ ] Sign out, sign back in with **Sign in** → lands on `/dashboard`
- [ ] Wrong password → error message shown, no redirect
- [ ] `/login?next=//evil.com` → after sign-in you land on `/dashboard`, not evil.com

## 3. Onboarding
- [ ] Username field: uppercase/spaces are stripped as you type
- [ ] `login` or `dashboard` → "That one's reserved."
- [ ] `ab` → "3–30 characters…" error
- [ ] A username already claimed by your other account → "Already taken"
- [ ] Valid username + display name + bio → **Claim my Radar** → `/dashboard`
- [ ] Visiting `/onboarding` again redirects to `/dashboard`

## 4. Plans: add / edit / archive / delete
- [ ] **Add a plan** → fill title, tap category/timeframe/status pills, optional dates + note → **Post plan** → appears in list, toast shown
- [ ] Note field stops at 140 chars
- [ ] Status toggle on a card: tap **Booking Soon** → updates instantly; reload → still Booking Soon
- [ ] **Edit** → form is pre-filled → change title → **Save changes** → list updates
- [ ] **Archive** → moves to "Archived" section; public page no longer shows it
- [ ] **Restore** → back in the active list and on the public page
- [ ] **Delete** → button turns to "Tap to confirm" → tap again → gone (waits 3s then resets if not confirmed)

## 5. Public page + guest "I'm Interested" (private window)
- [ ] Open `/<your-username>` signed out: name, @handle, bio, plans grouped This Weekend → Later This Year
- [ ] Status pills colored: Idea (violet), Booking Soon (amber, pulsing dot), Locked In (green)
- [ ] **I'm Interested 👋** → drawer opens → submit with empty name → error shown
- [ ] Fill name, contact, note → **Send** → "Sent! <Name> knows you're down."
- [ ] Unknown username (e.g. `/nobody_here_123`) → "No one here (yet)" page

## 6. Lead count + leads drawer (back in your signed-in window)
- [ ] Reload `/dashboard` → that plan's badge shows **1**, header "interested" total matches
- [ ] Tap the badge → drawer lists name, contact, note, "just now"
- [ ] Tap the contact row → copied (check icon) → paste somewhere to confirm
- [ ] Trash icon → lead removed, badge count drops

## 7. Story image export
- [ ] **Story Card** → preview shows up to 5 active plans + `yourhost/username`
- [ ] **Download PNG** on desktop → file `radar-<username>-story.png`, 1080×1920
- [ ] Emoji and fonts render correctly in the PNG (not boxes)

## 8. Mobile + share sheet (real phone on the same Wi-Fi: `http://<your-LAN-IP>:3000`)
> Note: magic links point at whatever host you signed in from; sign in on the phone with the password flow for this step.
- [ ] Public page **Share Radar** → native share sheet opens; cancelling falls back to "Link copied"
- [ ] Dashboard **Story Card → Download PNG** → share sheet with the image (save to Photos / share to Instagram)
- [ ] Open your public link inside Instagram or WhatsApp's in-app browser → layout fits at 480px, drawer opens, submit works
- [ ] Dashboard: floating **+** button visible bottom-right on mobile

## 9. Link previews (needs a public URL, e.g. after deploying)
- [ ] `https://<domain>/<username>/opengraph-image` shows name + top 3 plans
- [ ] Paste `https://<domain>/<username>` into WhatsApp / iMessage → preview card appears

## 10. Plan Chain
Setup: re-run `supabase/schema.sql`, then `node --env-file=.env.local scripts/check-rls.mjs --pitch <your-username>` → all PASS (dismiss the "[RLS check]" pitch afterwards).

**Pitch from a private window**
- [ ] Your public page → bottom card "Got an idea? Pitch a plan to <Name>" → drawer opens, no login
- [ ] Contact field shows the hint "Instagram @handle or phone with country code…"
- [ ] Submit with an empty idea → error; fill everything → "Pitched!"

**Accept / dismiss (signed-in window)**
- [ ] Reload `/dashboard` → header **Pitches** button shows **1**
- [ ] Open drawer → pitch shows idea, timeframe, note, "from <name>" + tappable contact
- [ ] **Add to My Radar** → plan appears in your list with "🔗 Chained with @handle"; badge drops to 0
- [ ] Send another pitch, **Dismiss** it → gone, no plan created, doesn't come back on reload

**Chain pill on the public page**
- [ ] Accepted plan shows "🔗 Chained with @handle" on your public page
- [ ] Pitch sent with a **phone number** as contact → pill shows the pitcher's first name, never the number

**Double-accept (no duplicates)**
- [ ] Send a pitch. Open `/dashboard` in **two tabs**, open Pitches in both
- [ ] Tab 1: **Add to My Radar** → added. Tab 2: **Add to My Radar** → toast "That pitch was already handled.", pitch disappears
- [ ] Reload → the plan exists **once**

**Copy to my Radar (second account)**
- [ ] Sign in as a second, onboarded account → open the first account's public page
- [ ] Each plan card shows a small copy icon next to "I'm Interested" (not shown when signed out or on your own page)
- [ ] Tap it → check icon + toast "Added to your Radar" → **View** → plan is in your dashboard as "Just an Idea" with "🔗 Chained with @<first-username>"

**One-tap follow-up in the leads drawer**
- [ ] Send interest with `@some.handle` → leads drawer shows a black `@some.handle ↗` chip → opens instagram.com/some.handle
- [ ] Send interest with `+1 555 123 4567` → chip "WhatsApp +1 555…" → opens wa.me/15551234567
- [ ] Send interest with plain text (e.g. "alex") → no chip, just the copy row

**Spam protection**
- [ ] Honeypot (do this for both the pitch drawer and the "I'm Interested" drawer): open the drawer, fill the visible fields, then paste this in the DevTools console and press Enter:
  ```js
  const el = document.querySelector('input[name=website]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'spam'); el.dispatchEvent(new Event('input', { bubbles: true }));
  ```
  Submit → the success screen shows, but **no** pitch/lead appears in the dashboard
- [ ] Rate cap: send 10 pitches to the same profile within an hour (private window) → the 11th shows "<Name> has a lot of pitches waiting right now. Try again in an hour!" Dismissing/accepting pending ones frees up the cap.

## Known limitation
- Unknown usernames return HTTP **200** (the not-found page streams in after the shell is sent). Visitors see the right page; only bots see a 200.
