import { body, json, withUser } from '@/lib/http';
import { joinGame } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ pin: string }>(req);
	return json({ result: await joinGame(user, Number(id), (b.pin || '').trim() || null) });
});
