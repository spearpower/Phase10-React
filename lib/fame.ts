// Hall of Fame: the winner of each finished month, worked out from game_points (Kampala time).
// Same ranking as the monthly leaderboard: most points, then fewest games, then name.
import { sql } from './db';

export interface Champion { month: string; userId: number; username: string; photo: string; points: number; games: number }

export async function hallOfFame(limit = 24): Promise<Champion[]> {
	const rows = await sql<{ month: string; user_id: number; username: string; photo: string; points: number; games: number }[]>`
		with monthly as (
			select to_char(gp.created_at at time zone 'Africa/Kampala', 'YYYY-MM') as month,
			       gp.user_id, sum(gp.points)::int as points, count(*)::int as games
			from game_points gp join users u on u.id = gp.user_id
			where not u.is_bot
			  and gp.created_at < date_trunc('month', now() at time zone 'Africa/Kampala') at time zone 'Africa/Kampala'
			group by 1, 2
		), ranked as (
			select m.*, u.username, u.photo,
			       row_number() over (partition by m.month order by m.points desc, m.games asc, u.username) as rk
			from monthly m join users u on u.id = m.user_id
		)
		select month, user_id, username, photo, points, games from ranked where rk = 1
		order by month desc limit ${limit}`;
	return rows.map(r => ({ month: r.month, userId: r.user_id, username: r.username, photo: r.photo, points: r.points, games: r.games }));
}

/** How many monthly titles each player holds: { userId: titles }. */
export async function titles(): Promise<Record<number, number>> {
	const out: Record<number, number> = {};
	for (const c of await hallOfFame(240)) out[c.userId] = (out[c.userId] || 0) + 1;
	return out;
}
