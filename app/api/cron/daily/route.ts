import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { closeStaleGames } from '@/lib/games';

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// It keeps the free Supabase database awake (it pauses after a week without queries),
// closes games nobody has touched for a day, and clears old table invites.
export async function GET(req: Request) {
	const secret = process.env.CRON_SECRET;
	if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
		return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
	}
	const started = Date.now();
	const [{ users }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;
	const closed = await closeStaleGames();
	const invites = await sql`delete from game_invites where created_at < now() - interval '7 days' returning id`.catch(() => []);
	const result = { ok: true, users, closed, invitesCleared: invites.length, ms: Date.now() - started, at: new Date().toISOString() };
	console.log('[cron-daily]', JSON.stringify(result));
	return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
