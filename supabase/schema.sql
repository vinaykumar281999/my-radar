-- =============================================================================
-- Radar — database schema + Row-Level Security
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run: tables use IF NOT EXISTS and policies are dropped first.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                  check (username ~ '^[a-z0-9_]{3,30}$')
                  -- usernames that would collide with app routes
                  check (username not in (
                    'login', 'logout', 'onboarding', 'dashboard', 'auth', 'api',
                    'admin', 'settings', 'about', 'help', 'radar', '_next'
                  )),
  display_name  text not null check (char_length(display_name) between 1 and 60),
  bio           text check (bio is null or char_length(bio) <= 120),
  avatar_url    text,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- plans
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 80),
  category        text not null
                    check (category in ('Trip', 'Concert', 'Weekend', 'Sports', 'Food & Nightlife')),
  timeframe       text not null
                    check (timeframe in ('This Weekend', 'This Month', 'Next Month', 'This Quarter', 'Later This Year')),
  specific_dates  text check (specific_dates is null or char_length(specific_dates) <= 40),
  status          text not null default 'Just an Idea'
                    check (status in ('Just an Idea', 'Booking Soon', 'Locked In')),
  notes           text check (notes is null or char_length(notes) <= 140),
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists plans_user_id_idx on public.plans (user_id, is_archived);

-- Plan Chain: who suggested a plan / which plan it was copied from.
-- ALTERs (not in CREATE TABLE) so re-running this file upgrades existing databases.
alter table public.plans
  add column if not exists suggested_by_handle text
    check (suggested_by_handle is null or char_length(suggested_by_handle) <= 61);
alter table public.plans
  add column if not exists chained_from_plan_id uuid
    references public.plans (id) on delete set null;

-- Owner controls: unlisted plans only show up via their direct link.
alter table public.plans
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'unlisted'));
alter table public.profiles
  add column if not exists pitches_paused boolean not null default false;

-- Calendar: optional real dates (all-day, inclusive). timeframe stays for fuzzy plans.
alter table public.plans add column if not exists start_date date;
alter table public.plans add column if not exists end_date date;
-- Spots: optional capacity. Taken spots are never stored; they're always
-- count(interests where status = 'approved'), so declining, deleting or
-- blocking an approved person frees their spot with no bookkeeping.
alter table public.plans
  add column if not exists capacity int check (capacity is null or capacity between 1 and 50);

-- Carpool: a category with a route and a departure. Seats = capacity. The
-- exact pickup spot and the driver's contact live in plan_private_details.
alter table public.plans drop constraint if exists plans_category_check;
alter table public.plans add constraint plans_category_check
  check (category in ('Trip', 'Concert', 'Weekend', 'Sports', 'Food & Nightlife', 'Carpool'));
alter table public.plans add column if not exists origin text
  check (origin is null or char_length(origin) between 1 and 60);
alter table public.plans add column if not exists destination text
  check (destination is null or char_length(destination) between 1 and 60);
alter table public.plans add column if not exists departs_at timestamptz;
-- IANA zone the departure was entered in, so times read the same for everyone.
alter table public.plans add column if not exists departs_tz text
  check (departs_tz is null or char_length(departs_tz) between 1 and 64);
alter table public.plans drop constraint if exists plans_carpool_fields;
alter table public.plans add constraint plans_carpool_fields
  check (category <> 'Carpool' or (
    capacity is not null and origin is not null and destination is not null
    and departs_at is not null and departs_tz is not null
  ));

-- "Flexible on dates": a public hint that the dates can move. Carpools leave
-- at a fixed time, so they're never flexible.
alter table public.plans add column if not exists dates_flexible boolean not null default false;
alter table public.plans drop constraint if exists plans_flexible_not_carpool;
alter table public.plans add constraint plans_flexible_not_carpool
  check (not (dates_flexible and category = 'Carpool'));

alter table public.plans drop constraint if exists plans_dates_order;
alter table public.plans add constraint plans_dates_order
  check (end_date is null or (start_date is not null and end_date >= start_date));

-- -----------------------------------------------------------------------------
-- interests
-- -----------------------------------------------------------------------------
create table if not exists public.interests (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.plans (id) on delete cascade,
  visitor_name    text not null check (char_length(visitor_name) between 1 and 60),
  contact_handle  text not null check (char_length(contact_handle) between 1 and 60),
  message         text check (message is null or char_length(message) <= 280),
  created_at      timestamptz not null default now()
);

create index if not exists interests_plan_id_idx on public.interests (plan_id, created_at desc);

-- -----------------------------------------------------------------------------
-- plan_pitches (friends suggest plans to a profile owner)
-- -----------------------------------------------------------------------------
create table if not exists public.plan_pitches (
  id              uuid primary key default gen_random_uuid(),
  target_user_id  uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 80),
  category        text not null
                    check (category in ('Trip', 'Concert', 'Weekend', 'Sports', 'Food & Nightlife')),
  timeframe       text not null
                    check (timeframe in ('This Weekend', 'This Month', 'Next Month', 'This Quarter', 'Later This Year')),
  pitcher_name    text not null check (char_length(pitcher_name) between 1 and 60),
  pitcher_handle  text not null check (char_length(pitcher_handle) between 1 and 60),
  notes           text check (notes is null or char_length(notes) <= 140),
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'dismissed')),
  created_at      timestamptz not null default now()
);

create index if not exists plan_pitches_target_idx
  on public.plan_pitches (target_user_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- Circles: owner-defined audiences (like Close Friends). A plan with
-- visibility = 'circles' is visible only to its owner and to signed-in members
-- of the circles listed in plan_audiences. Members never see each other.
-- -----------------------------------------------------------------------------
alter table public.plans drop constraint if exists plans_visibility_check;
alter table public.plans add constraint plans_visibility_check
  check (visibility in ('public', 'unlisted', 'circles'));

create table if not exists public.circles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  created_at  timestamptz not null default now(),
  unique (owner_id, name),
  -- target for plan_audiences' composite foreign key
  unique (id, owner_id)
);

create table if not exists public.circle_invites (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles (id) on delete cascade,
  token       text not null unique
                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  max_uses    int not null default 25 check (max_uses between 1 and 500),
  uses        int not null default 0 check (uses >= 0),
  revoked_at  timestamptz
);

create index if not exists circle_invites_circle_idx on public.circle_invites (circle_id);

create table if not exists public.circle_members (
  circle_id   uuid not null references public.circles (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  -- set when they joined through an invite link (drives the owner's join notice)
  invite_id   uuid references public.circle_invites (id) on delete set null,
  -- when the owner dismissed the "joined via invite link" notice
  seen_at     timestamptz,
  primary key (circle_id, user_id)
);

create index if not exists circle_members_user_idx on public.circle_members (user_id, circle_id);

-- (id, user_id) is already unique via the primary key; the explicit constraint
-- lets plan_audiences reference it so a plan and its circles share one owner.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_id_user_key') then
    alter table public.plans add constraint plans_id_user_key unique (id, user_id);
  end if;
end $$;

create table if not exists public.plan_audiences (
  plan_id    uuid not null,
  owner_id   uuid not null,
  circle_id  uuid not null,
  primary key (plan_id, circle_id),
  foreign key (plan_id, owner_id) references public.plans (id, user_id) on delete cascade,
  foreign key (circle_id, owner_id) references public.circles (id, owner_id) on delete cascade
);

create index if not exists plan_audiences_circle_idx on public.plan_audiences (circle_id);

-- Who sent an interest, when signed in (set by the server, never by clients).
alter table public.interests
  add column if not exists user_id uuid references public.profiles (id) on delete set null;
create unique index if not exists interests_plan_user_key
  on public.interests (plan_id, user_id) where user_id is not null;

-- 'interested' for plans without capacity; spot requests go pending -> approved / declined.
alter table public.interests
  add column if not exists status text not null default 'interested'
    check (status in ('interested', 'pending', 'approved', 'declined'));
create index if not exists interests_plan_status_idx on public.interests (plan_id, status);

-- Helpers below are SECURITY DEFINER so RLS policies can use them without
-- recursing through each other's policies. The ones callable by clients only
-- ever answer about the caller (auth.uid()), never about another user.

create or replace function public.is_circle_owner(p_circle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circles c where c.id = p_circle_id and c.owner_id = auth.uid());
$$;

create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members cm where cm.circle_id = p_circle_id and cm.user_id = auth.uid()
  );
$$;

-- Is the caller a member of a circle this plan is shared with? (Says nothing
-- about plans that don't exist or aren't shared with them: both are false.)
create or replace function public.viewer_in_plan_circles(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
      from public.plan_audiences pa
      join public.circle_members cm on cm.circle_id = pa.circle_id
     where pa.plan_id = p_plan_id and cm.user_id = auth.uid()
  );
$$;

-- Names of the caller's circles this plan is shared with (for "Shared with you · College").
create or replace function public.viewer_circle_names(p_plan_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.name order by c.name), '{}')
    from public.plan_audiences pa
    join public.circle_members cm on cm.circle_id = pa.circle_id and cm.user_id = auth.uid()
    join public.circles c on c.id = pa.circle_id
   where pa.plan_id = p_plan_id;
$$;

-- Could this user open this plan by its id? Owner always; otherwise the plan
-- must be active and public, unlisted, or shared with one of their circles.
-- Server-side only (service role, triggers): it answers about any user.
create or replace function public.can_user_see_plan(p_plan_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plans p
     where p.id = p_plan_id
       and (
         p.user_id = p_user_id
         or (not p.is_archived and p.visibility in ('public', 'unlisted'))
         or (
           not p.is_archived and p.visibility = 'circles' and p_user_id is not null
           and exists (
             select 1
               from public.plan_audiences pa
               join public.circle_members cm on cm.circle_id = pa.circle_id
              where pa.plan_id = p.id and cm.user_id = p_user_id
           )
         )
       )
  );
$$;

revoke all on function public.can_user_see_plan(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Privileges (newer Supabase projects don't always auto-grant on new tables)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
grant select, delete on public.interests to authenticated;
grant select, update, delete on public.plan_pitches to authenticated;
-- Interests and pitches are submitted only through the app's server actions
-- (Turnstile + per-IP rate limit), which insert with the service-role key.
-- Revoking here also removes the direct anon insert older versions granted.
revoke insert on public.interests from anon, authenticated;
revoke insert on public.plan_pitches from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.plans     enable row level security;
alter table public.interests enable row level security;
alter table public.plan_pitches enable row level security;

-- profiles: public read, owner write
drop policy if exists "profiles_select_all"  on public.profiles;
drop policy if exists "profiles_insert_own"  on public.profiles;
drop policy if exists "profiles_update_own"  on public.profiles;

create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- plans: anyone reads active public plans; signed-in members read active plans
-- shared with their circles; owners see (and manage) all of their own.
-- Unlisted plans are never listed (they load by id via get_public_plan).
drop policy if exists "plans_select_public" on public.plans;
drop policy if exists "plans_insert_own"    on public.plans;
drop policy if exists "plans_update_own"    on public.plans;
drop policy if exists "plans_delete_own"    on public.plans;

create policy "plans_select_public" on public.plans
  for select using (
    auth.uid() = user_id
    or (
      is_archived = false
      and (
        visibility = 'public'
        or (visibility = 'circles' and public.viewer_in_plan_circles(id))
      )
    )
  );

create policy "plans_insert_own" on public.plans
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "plans_update_own" on public.plans
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plans_delete_own" on public.plans
  for delete to authenticated
  using (auth.uid() = user_id);

-- interests: submitted via the server (service role, see guard_interest);
-- only the plan owner can read/delete
drop policy if exists "interests_insert_anyone"  on public.interests;
drop policy if exists "interests_select_owner"   on public.interests;
drop policy if exists "interests_delete_owner"   on public.interests;

drop policy if exists "interests_select_own_request" on public.interests;
-- A signed-in requester can read their own request (to see Pending / Approved).
create policy "interests_select_own_request" on public.interests
  for select to authenticated using (user_id = auth.uid());

create policy "interests_select_owner" on public.interests
  for select to authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "interests_delete_owner" on public.interests
  for delete to authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- plan_pitches: submitted via the server (service role, see guard_pitch);
-- only the target user can read, accept/dismiss, or delete their pitches
drop policy if exists "pitches_insert_anyone" on public.plan_pitches;
drop policy if exists "pitches_select_target" on public.plan_pitches;
drop policy if exists "pitches_update_target" on public.plan_pitches;
drop policy if exists "pitches_delete_target" on public.plan_pitches;

create policy "pitches_select_target" on public.plan_pitches
  for select to authenticated
  using (auth.uid() = target_user_id);

create policy "pitches_update_target" on public.plan_pitches
  for update to authenticated
  using (auth.uid() = target_user_id)
  with check (auth.uid() = target_user_id);

create policy "pitches_delete_target" on public.plan_pitches
  for delete to authenticated
  using (auth.uid() = target_user_id);

-- -----------------------------------------------------------------------------
-- accept_pitch: atomically turn a pending pitch into a plan.
-- SECURITY INVOKER, so RLS still applies: the caller must be the pitch's target
-- (pitches_update_target) and the plan is inserted as them (plans_insert_own).
-- The UPDATE ... WHERE status = 'pending' takes a row lock, so two concurrent
-- calls can't both succeed — the second one finds no pending row and raises,
-- and no duplicate plan is created.
-- -----------------------------------------------------------------------------
create or replace function public.accept_pitch(p_pitch_id uuid, p_suggested_by text)
returns public.plans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pitch public.plan_pitches;
  v_plan  public.plans;
begin
  update public.plan_pitches
     set status = 'accepted'
   where id = p_pitch_id
     and target_user_id = auth.uid()
     and status = 'pending'
  returning * into v_pitch;

  if not found then
    raise exception 'pitch_not_pending'
      using errcode = 'P0002',
            hint = 'The pitch does not exist, is not yours, or was already accepted/dismissed.';
  end if;

  insert into public.plans (user_id, title, category, timeframe, notes, status, suggested_by_handle)
  values (
    v_pitch.target_user_id,
    v_pitch.title,
    v_pitch.category,
    v_pitch.timeframe,
    v_pitch.notes,
    'Just an Idea',
    nullif(left(trim(p_suggested_by), 61), '')
  )
  returning * into v_plan;

  return v_plan;
end;
$$;

revoke all on function public.accept_pitch(uuid, text) from public, anon;
grant execute on function public.accept_pitch(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Pitch rate cap: at most 10 pending pitches per target user per hour.
-- SECURITY DEFINER so the count sees rows the (anon) inserter can't read;
-- it only returns a yes/no via the exception, never row data.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_pitch_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
      from public.plan_pitches
     where target_user_id = new.target_user_id
       and status = 'pending'
       and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'too_many_pitches'
      using errcode = 'P0001',
            hint = 'This person has 10 pending pitches from the last hour. Try again later.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_pitch_rate_limit() from public, anon, authenticated;

drop trigger if exists plan_pitches_rate_limit on public.plan_pitches;
create trigger plan_pitches_rate_limit
  before insert on public.plan_pitches
  for each row execute function public.enforce_pitch_rate_limit();

-- -----------------------------------------------------------------------------
-- Username changes: old usernames keep redirecting and stay reserved for the
-- original owner. Only the trigger below writes this table; nobody can read it
-- directly (resolve_username() answers one lookup at a time).
-- -----------------------------------------------------------------------------
create table if not exists public.username_history (
  username    text primary key check (username ~ '^[a-z0-9_]{3,30}$'),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  changed_at  timestamptz not null default now()
);

create index if not exists username_history_user_idx on public.username_history (user_id);

alter table public.username_history enable row level security;
revoke all on public.username_history from anon, authenticated;

create or replace function public.guard_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.username = old.username then
    return new;
  end if;

  -- Serialize claims on the same name, so a rename and someone else's claim of
  -- the freed name can't interleave.
  perform pg_advisory_xact_lock(hashtext('username:' || new.username));
  if tg_op = 'UPDATE' then
    perform pg_advisory_xact_lock(hashtext('username:' || old.username));
  end if;

  if exists (
    select 1 from public.username_history h
     where h.username = new.username and h.user_id <> new.id
  ) then
    -- Same code as a unique violation, so clients treat it as "taken".
    raise exception 'username_reserved' using errcode = '23505';
  end if;

  if tg_op = 'UPDATE' then
    -- Taking back one of your own old names makes it current again.
    delete from public.username_history where username = new.username;

    if (select count(*) from public.username_history where user_id = new.id) >= 10 then
      raise exception 'too_many_username_changes' using errcode = 'P0001';
    end if;

    insert into public.username_history (username, user_id)
    values (old.username, old.id)
    on conflict (username) do update set user_id = excluded.user_id, changed_at = now();
  end if;

  return new;
end;
$$;

revoke all on function public.guard_username() from public, anon, authenticated;

drop trigger if exists profiles_guard_username on public.profiles;
create trigger profiles_guard_username
  before insert or update of username on public.profiles
  for each row execute function public.guard_username();

-- Is this username free for the caller? (Their own current/old names count as free.)
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,30}$'
     and not exists (
       select 1 from public.profiles p
        where p.username = lower(p_username) and p.id is distinct from auth.uid()
     )
     and not exists (
       select 1 from public.username_history h
        where h.username = lower(p_username) and h.user_id is distinct from auth.uid()
     );
$$;

-- Current username for an old one (null if it was never renamed). Used by proxy.ts.
create or replace function public.resolve_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.username
    from public.username_history h
    join public.profiles p on p.id = h.user_id
   where h.username = lower(p_username);
$$;

revoke all on function public.username_available(text) from public;
revoke all on function public.resolve_username(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.resolve_username(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Blocked senders. Contacts are compared in normalized form, so "@Alex.R",
-- "alex.r" and "instagram.com/alex.r" are the same person, and phone numbers
-- compare by digits only.
-- -----------------------------------------------------------------------------
create or replace function public.normalize_contact(p_contact text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_contact, '')));
begin
  if v ~ '^(https?://)?(www\.)?instagram\.com/' then
    v := split_part(split_part(regexp_replace(v, '^(https?://)?(www\.)?instagram\.com/', ''), '?', 1), '/', 1);
  end if;
  v := ltrim(v, '@');
  if v ~ '^\+?[0-9 ().-]{7,20}$' then
    v := regexp_replace(v, '[^0-9]', '', 'g');
  end if;
  return v;
end;
$$;

create table if not exists public.blocked_contacts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  contact_key  text not null check (char_length(contact_key) between 1 and 60),
  -- the contact as it was written, for the settings list
  label        text check (label is null or char_length(label) <= 60),
  created_at   timestamptz not null default now(),
  unique (owner_id, contact_key)
);

alter table public.blocked_contacts enable row level security;
revoke all on public.blocked_contacts from anon;
grant select, insert, delete on public.blocked_contacts to authenticated;

drop policy if exists "blocked_select_own" on public.blocked_contacts;
drop policy if exists "blocked_insert_own" on public.blocked_contacts;
drop policy if exists "blocked_delete_own" on public.blocked_contacts;

create policy "blocked_select_own" on public.blocked_contacts
  for select to authenticated using (auth.uid() = owner_id);
create policy "blocked_insert_own" on public.blocked_contacts
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "blocked_delete_own" on public.blocked_contacts
  for delete to authenticated using (auth.uid() = owner_id);

-- Block a sender and clear what they already sent: dismisses their pending
-- pitches and deletes their interests on the caller's plans. SECURITY INVOKER,
-- so RLS limits every statement to the caller's own rows.
-- Returns {"pitch_ids": [...], "interests": [{"id", "plan_id", "status"}, ...]}.
create or replace function public.block_contact(p_contact text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key       text := public.normalize_contact(p_contact);
  v_pitches   jsonb;
  v_interests jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_key = '' then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;

  insert into public.blocked_contacts (owner_id, contact_key, label)
  values (auth.uid(), left(v_key, 60), left(btrim(p_contact), 60))
  on conflict (owner_id, contact_key) do nothing;

  with dismissed as (
    update public.plan_pitches
       set status = 'dismissed'
     where target_user_id = auth.uid()
       and status = 'pending'
       and public.normalize_contact(pitcher_handle) = v_key
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_pitches from dismissed;

  with removed as (
    delete from public.interests i
     using public.plans p
     where p.id = i.plan_id
       and p.user_id = auth.uid()
       and public.normalize_contact(i.contact_handle) = v_key
    returning i.id, i.plan_id, i.status
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'plan_id', plan_id, 'status', status)), '[]'::jsonb)
    into v_interests from removed;

  return jsonb_build_object('pitch_ids', v_pitches, 'interests', v_interests);
end;
$$;

revoke all on function public.block_contact(text) from public, anon;
grant execute on function public.block_contact(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Submission guards. The service role bypasses RLS, so the rules the old
-- anon INSERT policies enforced live in triggers instead (they also apply to
-- anything else that writes these tables).
-- -----------------------------------------------------------------------------
create or replace function public.guard_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner      uuid;
  v_visibility text;
  v_capacity   int;
  v_category   text;
begin
  select p.user_id, p.visibility, p.capacity, p.category into v_owner, v_visibility, v_capacity, v_category
    from public.plans p
   where p.id = new.plan_id and p.is_archived = false;
  if not found then
    raise exception 'plan_unavailable' using errcode = 'P0001';
  end if;

  -- Circle plans: only a signed-in member may send interest. Same error as a
  -- missing plan, so non-members learn nothing.
  if v_visibility = 'circles'
     and (new.user_id is null or not public.can_user_see_plan(new.plan_id, new.user_id)) then
    raise exception 'plan_unavailable' using errcode = 'P0001';
  end if;

  -- Carpool riders must be signed in: approval later reveals the exact pickup
  -- to that account, so it has to be a real, identifiable person.
  if v_category = 'Carpool' and new.user_id is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;

  -- Status is never chosen by the sender: a request on a plan with spots
  -- starts pending (and is refused once it's full), otherwise it's interest.
  if v_capacity is not null then
    if (select count(*) from public.interests i where i.plan_id = new.plan_id and i.status = 'approved') >= v_capacity then
      raise exception 'plan_full' using errcode = 'P0001';
    end if;
    new.status := 'pending';
  else
    new.status := 'interested';
  end if;

  if exists (
    select 1 from public.blocked_contacts b
     where b.owner_id = v_owner and b.contact_key = public.normalize_contact(new.contact_handle)
  ) then
    raise exception 'sender_blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_interest() from public, anon, authenticated;

drop trigger if exists interests_guard on public.interests;
create trigger interests_guard
  before insert on public.interests
  for each row execute function public.guard_interest();

create or replace function public.guard_pitch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- New pitches always start pending.
  new.status := 'pending';

  if exists (
    select 1 from public.profiles pr where pr.id = new.target_user_id and pr.pitches_paused
  ) then
    raise exception 'pitches_paused' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.blocked_contacts b
     where b.owner_id = new.target_user_id
       and b.contact_key = public.normalize_contact(new.pitcher_handle)
  ) then
    raise exception 'sender_blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pitch() from public, anon, authenticated;

drop trigger if exists plan_pitches_guard on public.plan_pitches;
create trigger plan_pitches_guard
  before insert on public.plan_pitches
  for each row execute function public.guard_pitch();

-- -----------------------------------------------------------------------------
-- Per-IP rate limit for public submissions (called by the server with a
-- hashed IP as the bucket). Sliding window; returns false when over the limit.
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  bucket  text not null,
  hit_at  timestamptz not null default now()
);

create index if not exists rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, hit_at desc);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

create or replace function public.consume_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('rate:' || p_bucket));

  delete from public.rate_limit_hits
   where bucket = p_bucket and hit_at < now() - make_interval(secs => p_window_seconds);

  -- Occasionally sweep buckets that never came back.
  if random() < 0.01 then
    delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  end if;

  select count(*) into v_count from public.rate_limit_hits where bucket = p_bucket;
  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- One active plan by id, public or unlisted: backs the direct plan link
-- (/username/p/<id>) and its metadata. Plan ids are random UUIDs, so unlisted
-- plans can't be listed or guessed; RLS still hides them from list queries.
-- Circle plans are never returned here (see get_shared_plan).
-- -----------------------------------------------------------------------------
create or replace function public.get_public_plan(p_plan_id uuid)
returns setof public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.plans
   where id = p_plan_id and is_archived = false and visibility in ('public', 'unlisted');
$$;

revoke all on function public.get_public_plan(uuid) from public;
grant execute on function public.get_public_plan(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Private iCal feed: one secret token per user. Owner-only (the token is a
-- password for the feed, so it is not on the publicly readable profiles table).
-- The feed route reads it with the service role.
-- -----------------------------------------------------------------------------
create table if not exists public.calendar_feeds (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  -- 64 hex chars from two random UUIDs (gen_random_uuid is built in, no extension needed)
  token       text not null unique
                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
grant select on public.calendar_feeds to authenticated;

drop policy if exists "calendar_feeds_select_own" on public.calendar_feeds;
create policy "calendar_feeds_select_own" on public.calendar_feeds
  for select to authenticated using (auth.uid() = user_id);

-- Create the caller's feed token, or replace it (the old URL stops working).
create or replace function public.regenerate_calendar_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  insert into public.calendar_feeds (user_id) values (auth.uid())
  on conflict (user_id) do update
    set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        created_at = now()
  returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.regenerate_calendar_token() from public, anon;
grant execute on function public.regenerate_calendar_token() to authenticated;

-- -----------------------------------------------------------------------------
-- Circles: privileges, RLS and RPCs
-- -----------------------------------------------------------------------------
revoke all on public.circles, public.circle_members, public.circle_invites, public.plan_audiences from anon;
grant select, insert, update, delete on public.circles to authenticated;
grant select, insert, delete on public.circle_members to authenticated;
-- Owners may only mark join notices as seen, nothing else about a membership.
revoke update on public.circle_members from authenticated;
grant update (seen_at) on public.circle_members to authenticated;
grant select, delete on public.circle_invites to authenticated;
-- Owners pick the circle, expiry and use limit; the token is always generated.
revoke insert, update on public.circle_invites from authenticated;
grant insert (circle_id, expires_at, max_uses) on public.circle_invites to authenticated;
grant update (revoked_at) on public.circle_invites to authenticated;
grant select, insert, delete on public.plan_audiences to authenticated;

-- Invite links live at most 90 days. Clamp older rows first so adding the
-- constraint can't fail on an existing database (re-runs find nothing to clamp).
update public.circle_invites
   set expires_at = created_at + interval '90 days'
 where expires_at > created_at + interval '90 days';
alter table public.circle_invites drop constraint if exists circle_invites_expiry_cap;
alter table public.circle_invites add constraint circle_invites_expiry_cap
  check (expires_at <= created_at + interval '90 days');

-- Revoking is one-way: once revoked_at is set it can't be cleared or moved.
create or replace function public.guard_invite_revoke()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'invite_already_revoked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_invite_revoke() from public, anon, authenticated;

drop trigger if exists circle_invites_guard_revoke on public.circle_invites;
create trigger circle_invites_guard_revoke
  before update on public.circle_invites
  for each row execute function public.guard_invite_revoke();

-- New invite link with an expiry counted on the database clock (a browser
-- clock running ahead could otherwise trip the 90-day cap). SECURITY INVOKER:
-- the invites_owner policy and column grants still decide.
create or replace function public.create_circle_invite(p_circle_id uuid, p_days int, p_max_uses int)
returns public.circle_invites
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.circle_invites;
begin
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;
  insert into public.circle_invites (circle_id, expires_at, max_uses)
  values (p_circle_id, now() + make_interval(days => p_days), coalesce(p_max_uses, 500))
  returning * into v;
  return v;
end;
$$;

revoke all on function public.create_circle_invite(uuid, int, int) from public, anon;
grant execute on function public.create_circle_invite(uuid, int, int) to authenticated;

alter table public.circles        enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_invites enable row level security;
alter table public.plan_audiences enable row level security;

drop policy if exists "circles_select" on public.circles;
drop policy if exists "circles_insert_own" on public.circles;
drop policy if exists "circles_update_own" on public.circles;
drop policy if exists "circles_delete_own" on public.circles;
-- Members can read the name of circles they're in (for the "Shared with you" label).
create policy "circles_select" on public.circles
  for select to authenticated using (owner_id = auth.uid() or public.is_circle_member(id));
create policy "circles_insert_own" on public.circles
  for insert to authenticated with check (owner_id = auth.uid());
create policy "circles_update_own" on public.circles
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "circles_delete_own" on public.circles
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members_select" on public.circle_members;
drop policy if exists "members_insert_owner" on public.circle_members;
drop policy if exists "members_update_owner" on public.circle_members;
drop policy if exists "members_delete" on public.circle_members;
-- Owner sees everyone in their circles; a member sees only their own rows.
create policy "members_select" on public.circle_members
  for select to authenticated using (user_id = auth.uid() or public.is_circle_owner(circle_id));
-- Only the owner adds people directly (invite links go through redeem_circle_invite).
create policy "members_insert_owner" on public.circle_members
  for insert to authenticated
  with check (public.is_circle_owner(circle_id) and user_id <> auth.uid() and invite_id is null);
create policy "members_update_owner" on public.circle_members
  for update to authenticated
  using (public.is_circle_owner(circle_id)) with check (public.is_circle_owner(circle_id));
-- Owner removes anyone; a member can leave.
create policy "members_delete" on public.circle_members
  for delete to authenticated using (user_id = auth.uid() or public.is_circle_owner(circle_id));

drop policy if exists "invites_owner" on public.circle_invites;
create policy "invites_owner" on public.circle_invites
  for all to authenticated
  using (public.is_circle_owner(circle_id)) with check (public.is_circle_owner(circle_id));

drop policy if exists "audiences_owner" on public.plan_audiences;
create policy "audiences_owner" on public.plan_audiences
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Circle plans of one owner that are shared with the caller, each with
-- "shared_via": the caller's circle names. SECURITY INVOKER: plans RLS decides.
create or replace function public.get_shared_plans(p_owner_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(p) || jsonb_build_object('shared_via', to_jsonb(public.viewer_circle_names(p.id)))
              order by p.created_at desc),
    '[]'::jsonb)
    from public.plans p
   where p.user_id = p_owner_id
     and p.user_id <> auth.uid()
     and p.visibility = 'circles'
     and not p.is_archived
     and public.viewer_in_plan_circles(p.id);
$$;

-- One circle plan by id for the direct link, or null. Same rules as above.
create or replace function public.get_shared_plan(p_plan_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(p) || jsonb_build_object('shared_via', to_jsonb(public.viewer_circle_names(p.id)))
    from public.plans p
   where p.id = p_plan_id
     and p.visibility = 'circles'
     and not p.is_archived
     and public.viewer_in_plan_circles(p.id);
$$;

revoke all on function public.get_shared_plans(uuid) from public, anon;
revoke all on function public.get_shared_plan(uuid) from public, anon;
grant execute on function public.get_shared_plans(uuid) to authenticated;
grant execute on function public.get_shared_plan(uuid) to authenticated;

-- "View as": the caller's own active plans that p_member would see listed on
-- their page (null = signed out). Only ever about the caller's own plans.
create or replace function public.preview_visible_plans(p_member_id uuid)
returns setof public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.plans p
   where p.user_id = auth.uid()
     and not p.is_archived
     and (
       p.visibility = 'public'
       or (
         p.visibility = 'circles' and p_member_id is not null
         and exists (
           select 1
             from public.plan_audiences pa
             join public.circle_members cm on cm.circle_id = pa.circle_id
            where pa.plan_id = p.id and cm.user_id = p_member_id
         )
       )
     );
$$;

revoke all on function public.preview_visible_plans(uuid) from public, anon;
grant execute on function public.preview_visible_plans(uuid) to authenticated;

-- What an invite link is for, shown on /join before signing in.
-- Invalid links reveal nothing about the circle.
create or replace function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select i.expires_at, i.revoked_at, i.uses, i.max_uses, i.circle_id,
         c.name as circle_name, c.owner_id, pr.username, pr.display_name
    into v
    from public.circle_invites i
    join public.circles c on c.id = i.circle_id
    join public.profiles pr on pr.id = c.owner_id
   where i.token = p_token;

  if not found or v.revoked_at is not null or v.expires_at <= now() or v.uses >= v.max_uses then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', case
      when v.owner_id = auth.uid() then 'own_circle'
      when exists (select 1 from public.circle_members cm where cm.circle_id = v.circle_id and cm.user_id = auth.uid())
        then 'already_member'
      else 'valid'
    end,
    'circle_name', v.circle_name,
    'owner_username', v.username,
    'owner_display_name', v.display_name
  );
end;
$$;

-- Join a circle through an invite link. The invite row is locked, so the use
-- count can't be exceeded by concurrent joins.
create or replace function public.redeem_circle_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v     record;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  select i.id, i.circle_id, i.expires_at, i.revoked_at, i.uses, i.max_uses, c.owner_id, c.name, pr.username
    into v
    from public.circle_invites i
    join public.circles c on c.id = i.circle_id
    join public.profiles pr on pr.id = c.owner_id
   where i.token = p_token
     for update of i;

  if not found or v.revoked_at is not null or v.expires_at <= now() or v.uses >= v.max_uses then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  if v.owner_id = v_uid then
    return jsonb_build_object('status', 'own_circle', 'circle_name', v.name, 'owner_username', v.username);
  end if;

  if exists (select 1 from public.circle_members where circle_id = v.circle_id and user_id = v_uid) then
    return jsonb_build_object('status', 'already_member', 'circle_name', v.name, 'owner_username', v.username);
  end if;

  update public.circle_invites set uses = uses + 1 where id = v.id;
  insert into public.circle_members (circle_id, user_id, invite_id) values (v.circle_id, v_uid, v.id);

  return jsonb_build_object('status', 'joined', 'circle_name', v.name, 'owner_username', v.username);
end;
$$;

revoke all on function public.get_invite_preview(text) from public;
revoke all on function public.redeem_circle_invite(text) from public, anon;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
grant execute on function public.redeem_circle_invite(text) to authenticated;

-- Set a plan's audience in one transaction: visibility plus, for 'circles',
-- exactly these circles. SECURITY INVOKER: RLS limits it to the caller's own
-- plan, and plan_audiences' foreign keys to the caller's own circles.
create or replace function public.set_plan_audience(p_plan_id uuid, p_visibility text, p_circle_ids uuid[] default '{}')
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_circle_ids, '{}');
begin
  if p_visibility = 'circles' and cardinality(v_ids) = 0 then
    raise exception 'circles_required' using errcode = '22023';
  end if;

  update public.plans set visibility = p_visibility where id = p_plan_id and user_id = auth.uid();
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  if p_visibility <> 'circles' then
    v_ids := '{}';
  end if;
  delete from public.plan_audiences where plan_id = p_plan_id and not (circle_id = any (v_ids));
  insert into public.plan_audiences (plan_id, owner_id, circle_id)
  select p_plan_id, auth.uid(), unnest(v_ids)
  on conflict do nothing;
end;
$$;

revoke all on function public.set_plan_audience(uuid, text, uuid[]) from public, anon;
grant execute on function public.set_plan_audience(uuid, text, uuid[]) to authenticated;

-- "Copy to my Radar" only from active public plans, so a copy can never
-- republish an unlisted or circle plan. Same error whether the source is
-- missing or private, so it reveals nothing.
create or replace function public.guard_plan_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chained_from_plan_id is not null
     and (tg_op = 'INSERT' or new.chained_from_plan_id is distinct from old.chained_from_plan_id)
     and not exists (
       select 1 from public.plans p
        where p.id = new.chained_from_plan_id and p.visibility = 'public' and not p.is_archived
     ) then
    raise exception 'copy_source_unavailable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_plan_copy() from public, anon, authenticated;

drop trigger if exists plans_guard_copy on public.plans;
create trigger plans_guard_copy
  before insert or update of chained_from_plan_id on public.plans
  for each row execute function public.guard_plan_copy();

-- -----------------------------------------------------------------------------
-- Spots: approve / decline requests. SECURITY DEFINER with an explicit owner
-- check, because nobody (owners included) may update interests directly.
-- -----------------------------------------------------------------------------
revoke update on public.interests from anon, authenticated;

create or replace function public.approve_spot(p_interest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id  uuid;
  v_capacity int;
  v_status   text;
  v_taken    int;
begin
  select i.plan_id into v_plan_id from public.interests i where i.id = p_interest_id;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Lock the plan row first: concurrent approvals for this plan queue here, and
  -- each one counts only after the previous one committed. That's what makes
  -- overbooking impossible.
  select p.capacity into v_capacity
    from public.plans p
   where p.id = v_plan_id and p.user_id = auth.uid()
     for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';  -- not your plan: same answer
  end if;
  if v_capacity is null then
    raise exception 'plan_has_no_spots' using errcode = 'P0001';
  end if;

  select i.status into v_status from public.interests i where i.id = p_interest_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';  -- deleted while we waited
  end if;
  if v_status = 'approved' then
    select count(*) into v_taken from public.interests where plan_id = v_plan_id and status = 'approved';
    return jsonb_build_object('taken', v_taken, 'capacity', v_capacity);
  end if;

  select count(*) into v_taken from public.interests where plan_id = v_plan_id and status = 'approved';
  if v_taken >= v_capacity then
    raise exception 'plan_full' using errcode = 'P0001';
  end if;

  update public.interests set status = 'approved' where id = p_interest_id;
  return jsonb_build_object('taken', v_taken + 1, 'capacity', v_capacity);
end;
$$;

-- Decline a request, or take back an approval (which frees the spot).
create or replace function public.decline_spot(p_interest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.interests i
     set status = 'declined'
    from public.plans p
   where i.id = p_interest_id and p.id = i.plan_id and p.user_id = auth.uid() and p.capacity is not null;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.approve_spot(uuid) from public, anon;
revoke all on function public.decline_spot(uuid) from public, anon;
grant execute on function public.approve_spot(uuid) to authenticated;
grant execute on function public.decline_spot(uuid) to authenticated;

-- Taken / total spots for plans the caller can see (anon included, for public
-- and unlisted plans). Plans they can't see are simply left out.
create or replace function public.plan_spots(p_plan_ids uuid[])
returns table (plan_id uuid, capacity int, taken int)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.capacity,
         (select count(*)::int from public.interests i where i.plan_id = p.id and i.status = 'approved')
    from public.plans p
   where p.id = any (p_plan_ids)
     and p.capacity is not null
     and public.can_user_see_plan(p.id, auth.uid());
$$;

revoke all on function public.plan_spots(uuid[]) from public;
grant execute on function public.plan_spots(uuid[]) to anon, authenticated;

-- Capacity can't drop below the people already approved. The plan row is
-- already locked by this UPDATE, so it can't race an approval.
create or replace function public.guard_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capacity is not null
     and new.capacity is distinct from old.capacity
     and (select count(*) from public.interests where plan_id = new.id and status = 'approved') > new.capacity then
    raise exception 'capacity_below_approved' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_capacity() from public, anon, authenticated;

drop trigger if exists plans_guard_capacity on public.plans;
create trigger plans_guard_capacity
  before update of capacity on public.plans
  for each row execute function public.guard_capacity();

-- -----------------------------------------------------------------------------
-- Private plan details (carpool pickup spot, driver contact). A separate table
-- because RLS hides rows, not columns: nothing here can reach the public page,
-- link previews, the story image or anyone's feed. Readable by the owner, and
-- by riders whose request is approved and who can still see the plan.
-- -----------------------------------------------------------------------------
create table if not exists public.plan_private_details (
  plan_id         uuid primary key,
  owner_id        uuid not null,
  pickup_details  text check (pickup_details is null or char_length(pickup_details) <= 280),
  owner_contact   text check (owner_contact is null or char_length(owner_contact) <= 60),
  updated_at      timestamptz not null default now(),
  foreign key (plan_id, owner_id) references public.plans (id, user_id) on delete cascade
);

alter table public.plan_private_details enable row level security;
revoke all on public.plan_private_details from anon;
grant select, insert, update, delete on public.plan_private_details to authenticated;

-- Approved on this plan AND still allowed to see it (e.g. not removed from the circle).
create or replace function public.viewer_is_approved_rider(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.interests i
        where i.plan_id = p_plan_id and i.user_id = auth.uid() and i.status = 'approved'
     )
     and public.can_user_see_plan(p_plan_id, auth.uid());
$$;

drop policy if exists "private_details_owner" on public.plan_private_details;
drop policy if exists "private_details_approved" on public.plan_private_details;
create policy "private_details_owner" on public.plan_private_details
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "private_details_approved" on public.plan_private_details
  for select to authenticated using (public.viewer_is_approved_rider(plan_id));

-- =============================================================================
-- service_role (server-only key): keep this section last so it covers every
-- table and function above. It bypasses RLS; the triggers still apply.
-- =============================================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
