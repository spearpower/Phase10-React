import { json, withUser } from '@/lib/http';
import { searchPlayers } from '@/lib/friends';

export const GET = withUser(async (user, req: Request) => json({ players: await searchPlayers(user, new URL(req.url).searchParams.get('q') || '') }));
