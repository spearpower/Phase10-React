import { body, json, withUser } from '@/lib/http';
import { asBotLevel, startPractice } from '@/lib/games';
import { asEdition } from '@/lib/rulesets';

export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ friends: number; timer: number; level: string; edition: number }>(req);
	const timer = [0, 20, 30, 40, 50, 60].includes(Number(b.timer)) ? Number(b.timer) : 0;
	return json({ id: await startPractice(user, Number(b.friends) || 1, timer, asBotLevel(b.level), asEdition(b.edition)) });
});
