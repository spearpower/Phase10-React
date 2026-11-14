import { body, json, withUser } from '@/lib/http';
import { leaveGame } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ reason: string }>(req);
	await leaveGame(user, Number(id), b.reason);
	return json({ ok: true });
});
