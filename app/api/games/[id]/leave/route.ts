import { json, withUser } from '@/lib/http';
import { leaveGame } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, _req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	await leaveGame(user, Number(id));
	return json({ ok: true });
});
