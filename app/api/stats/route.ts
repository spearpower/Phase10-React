import { json, withUser } from '@/lib/http';
import { playerStats } from '@/lib/stats';

// GET /api/stats            -> my stats
// GET /api/stats?user=12    -> another player's stats (same numbers everyone can see on Scores)
export const GET = withUser(async (user, req: Request) => {
	const other = Number(new URL(req.url).searchParams.get('user')) || user.id;
	return json(await playerStats(other));
});
