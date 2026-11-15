// App-wide settings stored in app_settings (changed by admins).
import { sql } from './db';

export interface AppSettings { virtualFriends: boolean; voiceChat: boolean; orderShuffle: boolean }
type Key = 'virtual_friends' | 'voice_chat' | 'order_shuffle';

let cache: { at: number; value: AppSettings } | null = null;

export async function getSettings(): Promise<AppSettings> {
	if (cache && Date.now() - cache.at < 15000) return cache.value;
	let value: AppSettings = { virtualFriends: true, voiceChat: false, orderShuffle: false };
	try {
		const rows = await sql<{ key: string; value: { enabled?: boolean } }[]>`select key, value from app_settings`;
		const on = (k: Key, dflt: boolean) => { const r = rows.find(x => x.key === k); return r ? r.value?.enabled === true || (dflt && r.value?.enabled !== false) : dflt; };
		value = { virtualFriends: on('virtual_friends', true), voiceChat: on('voice_chat', false), orderShuffle: on('order_shuffle', false) };
	} catch {
		// app_settings missing (migration 001 not run yet): keep defaults, but Virtual Friends needs the migration
		value = { virtualFriends: false, voiceChat: false, orderShuffle: false };
	}
	cache = { at: Date.now(), value };
	return value;
}

async function setSwitch(key: Key, enabled: boolean, adminId: number): Promise<AppSettings> {
	await sql`
		insert into app_settings (key, value, updated_at, updated_by) values (${key}, ${sql.json({ enabled })}, now(), ${adminId})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
	cache = null;
	return getSettings();
}

export const setVirtualFriends = (enabled: boolean, adminId: number) => setSwitch('virtual_friends', enabled, adminId);
export const setVoiceChat = (enabled: boolean, adminId: number) => setSwitch('voice_chat', enabled, adminId);
export const setOrderShuffle = (enabled: boolean, adminId: number) => setSwitch('order_shuffle', enabled, adminId);
export const voiceConfigured = () => !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

/** Names (never values) of server settings that are missing, grouped by feature — shown to admins. */
export function missingServerSettings(): Record<'voice' | 'alerts' | 'dailyJob', string[]> {
	const miss = (names: string[]) => names.filter(n => !(process.env[n] || '').trim());
	return {
		voice: miss(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']),
		alerts: miss(['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']),
		dailyJob: miss(['CRON_SECRET']),
	};
}
