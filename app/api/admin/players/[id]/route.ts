import { body, fail, json, withUser } from '@/lib/http';
import { resetPassword, setRole, setStatus } from '@/lib/admin';

type Ctx = { params: Promise<{ id: string }> };

// POST { action: 'reset' | 'suspend' | 'reactivate' | 'role', role?: 'player' | 'admin' }
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const id = Number((await ctx.params).id);
	const b = await body<{ action: string; role: string }>(req);
	switch (b.action) {
		case 'reset': return json(await resetPassword(user, id));
		case 'suspend': await setStatus(user, id, 'suspended'); return json({ ok: true });
		case 'reactivate': await setStatus(user, id, 'active'); return json({ ok: true });
		case 'role': await setRole(user, id, b.role === 'admin' ? 'admin' : 'player'); return json({ ok: true });
		default: return fail('Unknown action');
	}
});
