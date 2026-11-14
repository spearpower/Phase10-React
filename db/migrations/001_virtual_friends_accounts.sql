-- =====================================================================
-- Rummy10 migration 001 — Virtual Friends, app settings, account updates
-- Safe to run more than once. Additive only: the current live app keeps
-- working before and after it runs.
-- Run it in Supabase (SQL Editor) and on any local database.
-- =====================================================================

-- 1. Virtual Friends are users flagged as bots (they can never sign in)
alter table public.users add column if not exists is_bot boolean not null default false;

-- 2. App-wide settings, changed by admins on the Admin page
create table if not exists public.app_settings (
	key         text        primary key,
	value       jsonb       not null,
	updated_at  timestamptz not null default now(),
	updated_by  bigint      references public.users(id)
);
alter table public.app_settings enable row level security;
do $$
begin
	if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.app_settings from anon; end if;
	if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.app_settings from authenticated; end if;
end $$;

insert into public.app_settings (key, value) values ('virtual_friends', '{"enabled": true}')
on conflict (key) do nothing;

-- 3. The Virtual Friends themselves (a table seats at most 5 of them)
insert into public.users (username, password_hash, fullname, photo, role, status, is_bot)
select v.username, '!locked', v.fullname, v.photo, 'player', 'active', true
from (values
	('Amara',  'Amara (Virtual Friend)',  'f03.svg'),
	('Kato',   'Kato (Virtual Friend)',   'f06.svg'),
	('Zawadi', 'Zawadi (Virtual Friend)', 'f09.svg'),
	('Tendo',  'Tendo (Virtual Friend)',  'f12.svg'),
	('Nia',    'Nia (Virtual Friend)',    'f15.svg'),
	('Jabari', 'Jabari (Virtual Friend)', 'f18.svg')
) as v(username, fullname, photo)
where not exists (select 1 from public.users u where lower(u.username) = lower(v.username));

create index if not exists users_is_bot_idx on public.users (is_bot) where is_bot;

-- Optional: make someone an admin (replace the username, then run this line on its own)
-- update public.users set role = 'admin' where lower(username) = lower('gerald');
