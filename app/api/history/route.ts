import { json, withUser } from '@/lib/http';
import { recentGames } from '@/lib/stats';

export const GET = withUser(async user => json({ games: await recentGames(user.id) }));
