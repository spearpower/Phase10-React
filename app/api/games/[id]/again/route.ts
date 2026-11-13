import { json, withUser } from '@/lib/http';
import { playAgain } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, _req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	return json({ id: await playAgain(user, Number(id)) });
});
