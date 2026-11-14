import { body, json, withUser } from '@/lib/http';
import { changePassword } from '@/lib/users';

export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ current: string; next: string; repeat: string }>(req);
	await changePassword(user.id, b.current || '', b.next || '', b.repeat || '');
	return json({ ok: true });
});
