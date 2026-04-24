-- Flappy Bird Multiplayer — Supabase schema
-- Run this entire file once in Supabase → SQL Editor → New query → Run.
-- Idempotent: safe to re-run.

-- =========================================================
-- TABLES
-- =========================================================

-- One row per auth.users row. Holds the username + per-mode personal bests.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null,
    highest_solo integer not null default 0,
    highest_multiplayer integer not null default 0,
    created_at timestamptz not null default now()
);

-- One row per (username, mode) — used to render the top-10 tables.
-- Guest rows just use a random GUEST_xxxx username; real users match their profile.
create table if not exists public.leaderboards (
    id bigserial primary key,
    username text not null,
    score integer not null check (score >= 0),
    mode text not null check (mode in ('SOLO','MULTIPLAYER')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (username, mode)
);

create index if not exists leaderboards_mode_score_idx
    on public.leaderboards (mode, score desc);

-- Keep updated_at fresh on every upsert-write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists leaderboards_touch_updated_at on public.leaderboards;
create trigger leaderboards_touch_updated_at
    before update on public.leaderboards
    for each row execute function public.touch_updated_at();

-- =========================================================
-- TRIGGER: auto-create a profile when a new auth user signs up
-- The server passes { username } in user_metadata during signup.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, username)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =========================================================
-- ROW LEVEL SECURITY
-- All writes in this app go through the server using the service role key,
-- which bypasses RLS. These policies exist so that if you ever expose the
-- anon key to the browser, reads work but writes stay locked down.
-- =========================================================

alter table public.profiles     enable row level security;
alter table public.leaderboards enable row level security;

-- Profiles: everyone can read; a logged-in user can update their own row.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
    on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
    on public.profiles for update
    using (auth.uid() = id) with check (auth.uid() = id);

-- Leaderboards: everyone can read. Writes go through service role only.
drop policy if exists "Leaderboards are viewable by everyone" on public.leaderboards;
create policy "Leaderboards are viewable by everyone"
    on public.leaderboards for select using (true);

-- Clean up the (now-unused) matchmaking artefacts from earlier revisions.
-- Matchmaking is handled entirely client-side over Supabase Realtime
-- Presence now — no database tables or RPCs are involved.
drop function if exists public.find_or_create_match(text);
drop table     if exists public.match_queue;
