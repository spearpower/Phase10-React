import { json, withUser } from '@/lib/http';
import { getGame } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	return json(await getGame(user, Number(id)));
});
