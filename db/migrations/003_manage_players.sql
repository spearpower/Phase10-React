-- =====================================================================
-- Rummy10 migration 003 — super admin, leaving / removing players, ending games
-- Safe to run more than once. Additive: the current live app keeps working.
-- Run in Supabase (SQL Editor) and on any local database BEFORE the code goes live.
-- =====================================================================

-- 1. A "superadmin" role (can remove players from, and end, any game; also an admin)
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('player', 'admin', 'superadmin'));

-- Gero is the super admin (does nothing if there is no user called gero yet)
update public.users set role = 'superadmin' where lower(username) = 'gero' and not is_bot;

-- 2. Games can be ended early, with a reason
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check check (status in ('lobby', 'playing', 'finished', 'abandoned', 'ended'));
alter table public.games add column if not exists end_reason text;
alter table public.games add column if not exists ended_by bigint references public.users(id);

-- 3. Players who leave or are removed keep their seat row for the record
alter table public.game_players add column if not exists left_at timestamptz;
alter table public.game_players add column if not exists left_reason text;
alter table public.game_players add column if not exists left_by bigint references public.users(id);
