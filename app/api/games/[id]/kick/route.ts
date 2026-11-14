import { body, json, withUser } from '@/lib/http';
import { kickPlayer } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ userId: number; reason: string }>(req);
	await kickPlayer(user, Number(id), Number(b.userId), b.reason);
	return json({ ok: true });
});
