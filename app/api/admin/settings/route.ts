import { body, fail, json, withUser } from '@/lib/http';
import { getSettings, setVirtualFriends } from '@/lib/settings';
import { getAccount } from '@/lib/users';

// Admin rights are checked against the database (not the cookie), so a role change applies at once.
async function isAdmin(id: number) {
	try { const r = (await getAccount(id)).role as string; return r === 'admin' || r === 'superadmin'; } catch { return false; }
}

export const GET = withUser(async user => {
	if (!(await isAdmin(user.id))) return fail('Admins only', 403);
	return json(await getSettings());
});

export const POST = withUser(async (user, req: Request) => {
	if (!(await isAdmin(user.id))) return fail('Admins only', 403);
	const b = await body<{ virtualFriends: boolean }>(req);
	return json(await setVirtualFriends(b.virtualFriends === true, user.id));
});
