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
-- Privileges (newer Supabase projects don't always auto-grant on new tables)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
grant insert on public.interests to anon, authenticated;
grant select, delete on public.interests to authenticated;

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.plans     enable row level security;
alter table public.interests enable row level security;

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
