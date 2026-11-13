import { json, withUser } from '@/lib/http';
import { leaderboard } from '@/lib/games';

export const GET = withUser(async () => json({ rows: await leaderboard() }));
