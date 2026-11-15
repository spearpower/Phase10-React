import { json, withUser } from '@/lib/http';
import { leaderboard } from '@/lib/games';
import { hallOfFame, titles } from '@/lib/fame';

export const GET = withUser(async () => {
	const [rows, fame] = await Promise.all([leaderboard(), hallOfFame()]);
	const t: Record<number, number> = {};
	for (const c of fame) t[c.userId] = (t[c.userId] || 0) + 1;
	return json({ rows: rows.map(r => ({ ...r, titles: t[r.id] || 0 })), hallOfFame: fame });
});
