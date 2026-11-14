// App-wide settings stored in app_settings (changed by admins).
import { sql } from './db';

export interface AppSettings { virtualFriends: boolean }

let cache: { at: number; value: AppSettings } | null = null;

export async function getSettings(): Promise<AppSettings> {
	if (cache && Date.now() - cache.at < 15000) return cache.value;
	let value: AppSettings = { virtualFriends: true };
	try {
		const rows = await sql<{ key: string; value: { enabled?: boolean } }[]>`select key, value from app_settings`;
		const vf = rows.find(r => r.key === 'virtual_friends');
		value = { virtualFriends: vf ? vf.value?.enabled !== false : true };
	} catch {
		// app_settings missing (migration 001 not run yet): keep defaults, but Virtual Friends needs the migration
		value = { virtualFriends: false };
	}
	cache = { at: Date.now(), value };
	return value;
}

export async function setVirtualFriends(enabled: boolean, adminId: number): Promise<AppSettings> {
	await sql`
		insert into app_settings (key, value, updated_at, updated_by) values ('virtual_friends', ${sql.json({ enabled })}, now(), ${adminId})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
	cache = null;
	return getSettings();
}
