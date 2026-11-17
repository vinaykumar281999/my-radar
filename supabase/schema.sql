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

-- plans: public read of active, public plans (unlisted ones via get_public_plan);
-- owners see (and manage) all of their own
drop policy if exists "plans_select_public" on public.plans;
drop policy if exists "plans_insert_own"    on public.plans;
drop policy if exists "plans_update_own"    on public.plans;
drop policy if exists "plans_delete_own"    on public.plans;

create policy "plans_select_public" on public.plans
  for select using ((is_archived = false and visibility = 'public') or auth.uid() = user_id);

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
-- Returns {"pitch_ids": [...], "interests": [{"id", "plan_id"}, ...]}.
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
    returning i.id, i.plan_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'plan_id', plan_id)), '[]'::jsonb)
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
  v_owner uuid;
begin
  select p.user_id into v_owner
    from public.plans p
   where p.id = new.plan_id and p.is_archived = false;
  if not found then
    raise exception 'plan_unavailable' using errcode = 'P0001';
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
-- (/username/p/<id>). Plan ids are random UUIDs, so unlisted plans can't be
-- listed or guessed; RLS still hides them from list queries.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_plan(p_plan_id uuid)
returns setof public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.plans where id = p_plan_id and is_archived = false;
$$;

revoke all on function public.get_public_plan(uuid) from public;
grant execute on function public.get_public_plan(uuid) to anon, authenticated;

-- =============================================================================
-- service_role (server-only key): keep this section last so it covers every
-- table and function above. It bypasses RLS; the triggers still apply.
-- =============================================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
