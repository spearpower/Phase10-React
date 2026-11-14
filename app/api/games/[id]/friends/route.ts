import { json, withUser } from '@/lib/http';
import { addVirtualFriend } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, _req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	await addVirtualFriend(user, Number(id));
	return json({ ok: true });
});
