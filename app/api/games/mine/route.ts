import { json, withUser } from '@/lib/http';
import { listMyGames } from '@/lib/games';

export const GET = withUser(async user => json({ games: await listMyGames(user) }));
