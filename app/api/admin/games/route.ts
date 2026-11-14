import { body, fail, json, withUser } from '@/lib/http';
import { closeStaleGames, liveTables, STALE_HOURS } from '@/lib/games';
import { getAccount } from '@/lib/users';

async function roleOf(id: number) {
	try { return (await getAccount(id)).role as string; } catch { return 'player'; }
}

// Admins see every live table; super admins can also manage them (on the table's own screen).
export const GET = withUser(async user => {
	const role = await roleOf(user.id);
	if (role !== 'admin' && role !== 'superadmin') return fail('Admins only', 403);
	const rows = await liveTables();
	const staleBefore = Date.now() - STALE_HOURS * 3600 * 1000;
	return json({
		superAdmin: role === 'superadmin', staleHours: STALE_HOURS, serverNow: new Date().toISOString(),
		tables: rows.map(r => ({ ...r, stale: new Date(r.updated_at).getTime() < staleBefore })),
	});
});

// POST { cleanup: true } closes games with no moves for STALE_HOURS
export const POST = withUser(async (user, req: Request) => {
	const role = await roleOf(user.id);
	if (role !== 'admin' && role !== 'superadmin') return fail('Admins only', 403);
	const b = await body<{ cleanup: boolean }>(req);
	if (b.cleanup !== true) return fail('Nothing to do');
	return json(await closeStaleGames());
});
