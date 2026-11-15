import { body, json, withUser } from '@/lib/http';
import { createGame, listOpenGames } from '@/lib/games';
import { asEdition } from '@/lib/rulesets';

export const GET = withUser(async (user, req: Request) => {
	const url = new URL(req.url);
	const games = await listOpenGames(user, url.searchParams.get('public') === '1', url.searchParams.get('q') || '');
	return json({ games });
});

export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ pin: string; timer: number; edition: number }>(req);
	const pin = (b.pin || '').trim() || null;
	const timer = [0, 20, 30, 40, 50, 60].includes(Number(b.timer)) ? Number(b.timer) : 40;
	const id = await createGame(user, pin, timer, asEdition(b.edition));
	return json({ id });
});
