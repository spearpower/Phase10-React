import { body, json, withUser } from '@/lib/http';
import { kickPlayer } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ userId: number }>(req);
	await kickPlayer(user, Number(id), Number(b.userId));
	return json({ ok: true });
});
