// Server -> clients "something changed" pings through Supabase Realtime Broadcast.
// Only a version number is sent; each client then fetches its own private view.
// Without Supabase env vars (local dev) this is a no-op and clients fall back to polling.
export async function notifyGame(gameId: number, version: number): Promise<void> {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return;
	try {
		await fetch(`${url}/realtime/v1/api/broadcast`, {
			method: 'POST',
			headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: [{ topic: `game-${gameId}`, event: 'v', payload: { v: version } }] }),
			signal: AbortSignal.timeout(2500),
		});
	} catch (e) {
		console.warn('realtime notify failed', e); // clients still poll, so the game keeps going
	}
}

/** The open-tables list changes when lobbies open/close. */
export async function notifyLobbyList(): Promise<void> {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return;
	try {
		await fetch(`${url}/realtime/v1/api/broadcast`, {
			method: 'POST',
			headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: [{ topic: 'lobbies', event: 'v', payload: { t: Date.now() } }] }),
			signal: AbortSignal.timeout(2500),
		});
	} catch { /* polling covers it */ }
}
