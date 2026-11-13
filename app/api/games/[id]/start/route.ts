import { body, json, withUser } from '@/lib/http';
import { startGame } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ timer: number }>(req);
	const timer = [0, 20, 30, 40, 50, 60].includes(Number(b.timer)) ? Number(b.timer) : 40;
	await startGame(user, Number(id), timer);
	return json({ ok: true });
});
