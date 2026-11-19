# Manual test checklist

Run `npm run dev` and open http://localhost:3000. Use two browsers or a private window for the guest steps.

**Before testing:** `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` (interest and pitches fail without it), `supabase/schema.sql` has been re-run, and `node --env-file=.env.local scripts/check-rls.mjs` prints "All checks passed".

**Automated checks** (run these first; the manual list below covers what they can't):
- `npm run test:unit`: who-sees-what rules (story export, Copy to my Radar), dates, time zones, .ics, CSV, profile filters + `safeNext`, templates (never carry visibility), invite and circle defaults, rider flags, waitlist order
- `npm run test:db`: `schema.sql` fresh + re-run (empty, and over existing data), then RLS/trigger/function tests as anon, members, non-members, owners and the server, including two-session overbooking and waitlist-promotion tests. Needs local Postgres (`brew install postgresql@15`)
- `npm run test:leaks` with `npm run dev` running: creates 3 throwaway users in your project, byte-compares the signed-out profile page (with and without `?category=Trip`), OG image and a circle plan's link before/after adding private plans, checks copy, iCal, RPCs and interest submissions, then deletes the users
- After pulling schema changes, re-run `supabase/schema.sql` in the SQL editor **before** deploying the app: the app reads and writes the new columns. `scripts/check-rls.mjs` fails on the new table/functions until you do

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
Setup: see "Before testing" at the top.

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
- [ ] Each **public** plan card shows a small copy icon next to "I'm Interested" (not shown when signed out, on your own page, on unlisted or circle plans, or on carpools)
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
- [ ] Per-person pitch cap (10 pending per hour) — reachable from one browser again now that the per-IP limit is 20 per 10 minutes (section 12). Start with no pending pitches and no submissions from this network in the last 10 minutes, then send 10 pitches to the same profile from a private window → the 11th shows "<Name> has a lot of pitches waiting right now. Try again in an hour!" Dismissing/accepting pending ones frees up the cap.

## 11. Settings + username change
- [ ] Dashboard header → gear icon → `/settings`. Signed out, `/settings` → `/login?next=/settings`
- [ ] Username field shows "This is your current username"; Save is disabled until something changes
- [ ] Type `login` → "That one's reserved."; type another account's username → "Already taken"
- [ ] Change display name / bio only → Save → toast "Profile saved", dashboard shows the new name
- [ ] Change username `old` → `new` → hint says old links keep working → Save → toast "You're now @new"
- [ ] `curl -sI http://localhost:3000/old` → `HTTP/1.1 308` with `location: /new` (allow up to a minute: redirects are cached briefly)
- [ ] `/old/p/<plan-id>` → 308 to `/new/p/<plan-id>`
- [ ] Second account: onboarding or settings with username `old` → "Already taken" (it stays reserved for you)
- [ ] First account: change back to `old` → allowed; `/new` now 308s to `/old`
- [ ] Onboarding (new account) still checks availability the same way

## 12. Spam protection (server-side)
- [ ] Interest and pitch still work end to end (private window) after adding `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Direct API insert is blocked: `node --env-file=.env.local scripts/check-rls.mjs` → "anon INSERT on … is revoked" PASS
- [ ] Per-IP limit (20 per 10 minutes, interests and pitches combined): from one browser, 20 attempts within 10 minutes go through → the 21st shows "You've sent a lot in the last few minutes. Try again in 10 minutes." Every attempt counts, including ones refused for another reason. Use mostly interests (pitches stop at 10 per person first). E.g. right after the section 10 pitch-cap test (10 sent + 1 refused = 11 attempts), 9 more interests go through and the 10th is refused
- [ ] Honeypot still fakes success (section 10 console snippet) and nothing is saved
- [ ] Turnstile with test keys in `.env.local`: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` → restart dev → submissions work, Network tab shows a `challenges.cloudflare.com` request
- [ ] Always-fail keys: site `2x00000000000000000000AB`, secret `2x0000000000000000000000000000000AA` → "We couldn't verify you're human…", nothing saved
- [ ] Remove both keys → dev skips verification and submissions work
- [ ] View page source / DevTools Sources: no `SUPABASE_SERVICE_ROLE_KEY` or `TURNSTILE_SECRET_KEY` value anywhere

## 13. Owner controls
**Pause pitches**
- [ ] Settings → Pause pitches ON → public page no longer shows "Got an idea?"
- [ ] A pitch drawer that was already open when you paused → Send → "<Name> isn't taking pitches right now."
- [ ] Turn OFF → card is back, pitches work

**Unlisted plans**
- [ ] Edit a plan → Who can see it → Unlisted → Save → dashboard row shows a black "Unlisted" badge
- [ ] Public page (private window) no longer lists it; story card skips it
- [ ] Row → **Link** → toast "Private link copied…" → open it in a private window → the plan shows with I'm Interested working
- [ ] Interest sent through the direct link appears in that plan's leads
- [ ] `/<username>/p/<random-uuid>` → "This plan isn't available"; archived plan's link → same

**Block a sender**
- [ ] Pitches drawer → **Block** → button turns to "Tap to block" → tap → toast; all of that person's pending pitches disappear, and their interests vanish from every plan's count
- [ ] Leads drawer → **Block** on a lead → same, the lead disappears
- [ ] From the private window, send again as `@same.handle` (or `instagram.com/same.handle`, or different capitalization) → success screen shows, but nothing arrives
- [ ] Settings → Blocked senders lists them → **Unblock** → their next pitch arrives normally
- [ ] Known: `+1 555 123 4567` and `555 123 4567` are different senders (block the exact contact shown)

**Search, bulk, CSV** (send yourself 3+ pitches and 3+ interests first)
- [ ] Pitches drawer: type in search → list filters (title, name, handle, note); no match → "No pitches match"
- [ ] Select all → "N selected" → **Dismiss N** → gone, Pitches badge drops, they don't return on reload
- [ ] Select all only selects what's visible under the current search
- [ ] **CSV** → `radar-pitches-YYYY-MM-DD.csv` opens in Sheets/Excel with correct columns and accented names
- [ ] Leads drawer: same search; **Remove N** deletes them and the count badge updates; **CSV** → `radar-interested-….csv`
- [ ] A contact like `=1+1` exports as text (`'=1+1`), not a formula; `@handles` and `+1 555…` export unchanged
- [ ] Open leads for plan A, search/select, close, open plan B → search and selection are reset

## 14. Calendar
- [ ] New plan → Start date → the "When" pill jumps to the matching bucket (e.g. a Saturday this week → This Weekend)
- [ ] End date is disabled until Start is set and can't be before it; save with End before Start is blocked
- [ ] Dashboard row and public card show "Sat, Nov 21" (one day) or "Nov 21 – Nov 23" (range)
- [ ] Public page: dated plans are sorted by date inside their section; undated plans follow, newest first
- [ ] An older plan with free-text dates still shows them; editing it shows the "Dates (text)" field until you pick a start date
- [ ] Public card → Add to calendar → **Google** opens a prefilled all-day event (end day correct, link to the plan in details)
- [ ] **Apple / Outlook (.ics)** downloads a file; opening it adds the event (iPhone Safari shows the "Add to Calendar" sheet)
- [ ] Undated plans show no Add to calendar row
- [ ] Dashboard → **Month** → current month, today ringed, dots on dated days (multi-day plans on every day); tap a day → its plans list; tap a plan → edit dialog; arrows change month; undated count note at the bottom
- [ ] Settings → Calendar feed → **Create my feed link** → `…/api/ical/<64 chars>.ics`; open it in a browser → `.ics` text with your dated plans, including unlisted, excluding archived
- [ ] **Regenerate** → "Tap again…" → new link; the old one now returns 404
- [ ] Google Calendar → Other calendars → + → From URL → paste the link → events appear. Needs a **public** URL (deployed site): Google can't reach localhost, and it refreshes subscribed calendars only every several hours

## 15. Circles
Use three accounts: **owner**, **member**, **outsider** (e.g. three browsers / private windows).

**Managing circles (owner → Settings → Circles)**
- [ ] Create "College" → card appears; creating "College" again → "You already have a circle with that name."
- [ ] Add by username: member's username → chip appears; unknown name → "No one is @x"; your own → "That's you…"; same person twice → "already in"
- [ ] **Create invite link** → picker (Expires in 1 / 7 / 30 / 90 days, default 7; Up to No limit / 1 / 5 / 25, default 25) → **Create & copy** → row shows `0 / 25 · 7d left` (No limit shows `0 joined`); **Revoke** → row moves to the collapsed **Expired & revoked** list
- [ ] Delete a circle → "Tap again" → deleted; its plans now show "No circles — only you" on the dashboard

**Invite links**
- [ ] Signed out, open the link → "<Owner> invited you to “College”" → **Sign in to join** → (new account: onboarding) → lands back and joins automatically → "You're in College 🎉"
- [ ] Signed in, open a link → one tap **Join College**; opening it again → "You're already in"
- [ ] Owner opening their own link → "This is your circle"
- [ ] Revoked / expired / garbage link → "This invite link doesn't work anymore" (no circle name shown)
- [ ] Owner dashboard → "<name> joined College via invite link" notice → ✕ dismisses (stays gone on reload); with 2+ notices, **Dismiss all**
- [ ] Settings → remove someone who joined via a still-working link → dialog "Also revoke that invite link" (shows how many others used it) → with the box ticked, the link disappears; unticked, it stays
- [ ] Removing someone added by username (or whose link is already dead) → removed without the dialog
- [ ] Member → Settings → "Circles you're in" → **Leave**

**Audience**
- [ ] New plan → Who can see it → **Circles** → pick College → Post. With no circle picked → "Pick at least one circle."; with no circles at all → "Create one in Settings"
- [ ] Dashboard row shows a "College" badge; **Link** toast says only College members can open it
- [ ] Edit → switch to Public → badge gone and the plan is on your public page; back to Circles → gone again

**Who sees what** (the core of this feature)
- [ ] Signed out: your page shows only public plans, plus "Sign in to see plans shared with you" (that line shows on every profile, even with nothing shared)
- [ ] Outsider signed in: same as signed out (no prompt, no circle plans)
- [ ] Member signed in: circle plans appear in the right date group with "Shared with you · College"
- [ ] The circle plan's direct link: member → the plan; outsider and signed-out → "This plan isn't available", exactly like a made-up plan id; the link preview (paste in iMessage/WhatsApp) never shows its title
- [ ] Story Card and the OG image (`/<you>/opengraph-image`) never include circle or unlisted plans
- [ ] Member: no copy icon on circle plans. `npm run test:leaks` covers the API side
- [ ] Member sends I'm Interested on a circle plan → arrives in your leads. Remove them from the circle → the plan disappears for them, and sending again fails like a missing plan
- [ ] Dashboard → **View as…** → "Someone signed out" shows public plans only; picking the member shows public + College plans with the label; unlisted plans never appear

## 16. Spots
- [ ] Edit a plan → Spots: 2 → card shows "2 of 2 spots left" and **Request a spot ✋**
- [ ] Private window: request a spot → "Requested! <Name> will confirm your spot."
- [ ] Signed in as someone else: request → card switches to "Requested · waiting for an answer" (still there after reload)
- [ ] Dashboard row shows `0/2` with "2 new"; open it → **Spot requests**, meter "0 of 2 spots taken · 2 waiting"
- [ ] **Approve** both → meter 2 of 2; public card shows **Full** and the button becomes **Join the waitlist**; a third request (private window) → "You're on the waitlist" (see section 21)
- [ ] Signed-in requester's card now says "You're in ✓"
- [ ] **Take back spot** on one → frees it (card: "1 of 2 spots left"), requester sees "Not this time"
- [ ] Delete an approved request, or **Block** that person → their spot frees up immediately
- [ ] Try lowering Spots below the approved count → "More people are already approved than that…"
- [ ] Two tabs, plan with 1 spot left, 2 waiting: approve a different request in each tab at the same time → one succeeds, the other says "No spots left" (the database test proves this under real concurrency)
- [ ] CSV export from the requests drawer has a Status column

## 17. Carpool
- [ ] New plan → Category **Carpool** → "When"/dates/spots are replaced by From, To, Departure, Seats + "Only approved riders see these" (pickup, contact); Who can see it switches to **Circles**
- [ ] Missing route/time/seats → "A carpool needs From, To…"; choosing Public shows a confirmation box that must be ticked
- [ ] Card shows "SF → Tahoe", "Leaves Fri, Dec 4 · 3:30 PM PST" (the zone you entered it in, for everyone), "3 of 3 seats left", **Request a seat 🚗**
- [ ] Signed out (public carpool): button is **Sign in to request a seat** → after sign-in, back on the plan
- [ ] Rider requests → owner approves → rider's card shows "You're in ✓" plus the pickup spot and the driver contact (tappable). Pending or declined riders, other members and outsiders never see that block
- [ ] Take back the rider's seat, or remove them from the circle → the pickup block disappears for them
- [ ] Add to calendar → a timed event at the departure time (not all-day); same in the iCal feed
- [ ] Edit the carpool → pickup/contact load into the form; switching it to another category removes them
- [ ] Pitch form has no Carpool category; no copy icon on carpools

## 18. Invite links (management)
- [ ] Someone joins through a link → under that link: "Joined: @them"; still listed under the link after it's revoked or expired (in **Expired & revoked**)
- [ ] Expired / revoked / used-up links show the reason and date; the list is collapsed by default
- [ ] A revoked link can't be brought back (there's no un-revoke; the database refuses it)
- [ ] Opening a revoked or expired link → "This invite link doesn't work anymore" with no circle name, same as a made-up token

## 19. Profile filters
- [ ] Public page: category chips (6) and status chips (3) above the plans; tap Trip → only Trips, URL shows `?category=Trip`; tap again → cleared
- [ ] Trip + Locked In → `?category=Trip&status=Locked+In`; **Clear** removes both
- [ ] A filter with no matches → "No plans match" (no counts)
- [ ] Member signed in: filters also apply to "Shared with you" plans
- [ ] Signed out on `/<you>?category=Trip` → **Sign in to see plans shared with you** → after sign-in (password, magic link, and new account via onboarding) you land on `/<you>?category=Trip` with the filter applied
- [ ] View source of `/<you>?category=Trip` signed out: no chip is pressed (`aria-pressed="true"` absent), the full public list is in the HTML; filtering happens after load
- [ ] Unknown values (`?category=<script>`) are ignored

## 20. Templates and flexible dates
- [ ] New plan → template chips (Weekend Cabin, Road Trip, Concert / Night Out, Day Hike, Ride Share) → fills category, Just an Idea, title, spots; nothing is saved until **Post plan**
- [ ] A typed title is kept when picking a template; switching templates replaces only a template title
- [ ] **Ride Share** → Carpool, and Who can see it switches to **Circles** (with no circle ticked yet); templates never change Unlisted / Circles you already picked
- [ ] Editing a plan shows no template chips
- [ ] **Flexible on dates** checkbox (hidden for Carpool) → card shows "Dates flexible", dashboard row "· dates flexible"; switching to Carpool clears it

## 21. Waitlist
Use a plan with Spots: 1 and three accounts (or private windows) as requesters.
- [ ] Approve the first request → card **Full**, button **Join the waitlist**
- [ ] Second and third request → "You're on the waitlist"; signed-in requesters' cards show **Waitlist #1** / **Waitlist #2** (each sees only their own number)
- [ ] Owner: requests drawer → **Waitlist** section in order (#1, #2), meter shows "· 2 on waitlist"
- [ ] **Take back spot** on the approved person → #1 moves to the top as Waiting with **Promoted from waitlist** (never approved automatically); #2's card now says **Waitlist #1**
- [ ] Raise Spots to 3 → everyone who fits moves to Waiting
- [ ] Circle plan: remove a waitlisted member from the circle, then free a spot → they're skipped and the next member is promoted; the removed member sees "This plan isn't available"
- [ ] Signed out / non-member on a full circle plan → still "This plan isn't available" (never "waitlist")
- [ ] Spot counts on the public card never show the waitlist size

## 22. Carpool notes
- [ ] Request a seat → "For the driver" checkboxes: **I can take a turn driving**, **I'm bringing a big bag** (not shown on non-carpool plans)
- [ ] Owner: requests drawer shows **Can drive** / **Big bag** badges, "Approved riders: 2 riders can also drive · 1 big bag" and CSV columns
- [ ] Owner's own carpool card (on their page) shows the private block with the riders summary
- [ ] Edit carpool → **Note to riders** (280 max) → approved rider sees it next to the pickup; pending riders, other riders, outsiders and riders removed from the circle never do
- [ ] A rider never sees another rider's flags

## 23. Circle defaults
- [ ] Settings → circle → **Defaults** (collapsed, "only you see these"): pick by default, default spots, invite expiry / max uses → **Save defaults**
- [ ] Next **Create invite link** starts from those defaults
- [ ] New plan: choosing **Circles** ticks the "pick by default" circles; choosing Carpool (which switches to Circles itself) does not tick them
- [ ] Exactly one circle ticked with default spots and Spots left empty → Spots fills in (hint "This circle's default"); tick a second circle → it clears; typing your own spots is never overwritten
- [ ] A member of that circle can't see any of its defaults (Settings → "Circles you're in" shows only the name)

## Known limitation
- Unknown usernames return HTTP **200** (the not-found page streams in after the shell is sent). Visitors see the right page; only bots see a 200.
