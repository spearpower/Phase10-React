import { body, json, withUser } from '@/lib/http';
import { respondInvite } from '@/lib/friends';

type Ctx = { params: Promise<{ id: string }> };

// POST { accept: boolean }
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const b = await body<{ accept: boolean }>(req);
	return json(await respondInvite(user, Number((await ctx.params).id), b.accept === true));
});
