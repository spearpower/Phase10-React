import { after } from 'next/server';
import { body, json, withUser } from '@/lib/http';
import { alertStarted } from '@/lib/push';
import { asBotLevel, startGame } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ timer: number; level: string }>(req);
	const timer = [0, 20, 30, 40, 50, 60].includes(Number(b.timer)) ? Number(b.timer) : 40;
	await startGame(user, Number(id), timer, asBotLevel(b.level));
	after(() => alertStarted(Number(id), user.id, user.username));
	return json({ ok: true });
});
