import { after } from 'next/server';
import { json, withUser } from '@/lib/http';
import { alertStarted } from '@/lib/push';
import { quickFillAndStart } from '@/lib/games';

type Ctx = { params: Promise<{ id: string }> };

// POST: the Quick Game wait is over; fill empty seats with Virtual Friends and start
export const POST = withUser(async (user, _req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	await quickFillAndStart(user, Number(id));
	after(() => alertStarted(Number(id), user.id, user.username));
	return json({ ok: true });
});
