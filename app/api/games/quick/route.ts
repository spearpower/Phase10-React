import { json, withUser } from '@/lib/http';
import { quickGame } from '@/lib/games';

// POST: find a seat (or open a table) right now
export const POST = withUser(async user => json(await quickGame(user)));
