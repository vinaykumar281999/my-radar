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
grant insert on public.interests to anon, authenticated;
grant select, delete on public.interests to authenticated;
grant insert on public.plan_pitches to anon, authenticated;
grant select, update, delete on public.plan_pitches to authenticated;

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

-- plans: public read of active plans; owners see (and manage) all of their own
drop policy if exists "plans_select_public" on public.plans;
drop policy if exists "plans_insert_own"    on public.plans;
drop policy if exists "plans_update_own"    on public.plans;
drop policy if exists "plans_delete_own"    on public.plans;

create policy "plans_select_public" on public.plans
  for select using (is_archived = false or auth.uid() = user_id);

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

-- interests: anyone can submit (to an active plan); only the plan owner can read/delete
drop policy if exists "interests_insert_anyone"  on public.interests;
drop policy if exists "interests_select_owner"   on public.interests;
drop policy if exists "interests_delete_owner"   on public.interests;

create policy "interests_insert_anyone" on public.interests
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.plans p
      where p.id = plan_id and p.is_archived = false
    )
  );

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

-- plan_pitches: anyone can pitch (always as 'pending') to an existing profile;
-- only the target user can read, accept/dismiss, or delete their pitches
drop policy if exists "pitches_insert_anyone" on public.plan_pitches;
drop policy if exists "pitches_select_target" on public.plan_pitches;
drop policy if exists "pitches_update_target" on public.plan_pitches;
drop policy if exists "pitches_delete_target" on public.plan_pitches;

create policy "pitches_insert_anyone" on public.plan_pitches
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and exists (select 1 from public.profiles pr where pr.id = target_user_id)
  );

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
