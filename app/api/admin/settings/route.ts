import { body, fail, json, withUser } from '@/lib/http';
import { getSettings, missingServerSettings, setVirtualFriends, setVoiceChat, voiceConfigured } from '@/lib/settings';
import { getAccount } from '@/lib/users';

// Admin rights are checked against the database (not the cookie), so a role change applies at once.
async function isAdmin(id: number) {
	try { const r = (await getAccount(id)).role as string; return r === 'admin' || r === 'superadmin'; } catch { return false; }
}

export const GET = withUser(async user => {
	if (!(await isAdmin(user.id))) return fail('Admins only', 403);
	return json({ ...(await getSettings()), voiceReady: voiceConfigured(), missing: missingServerSettings() });
});

// POST { virtualFriends?: boolean, voiceChat?: boolean }
export const POST = withUser(async (user, req: Request) => {
	if (!(await isAdmin(user.id))) return fail('Admins only', 403);
	const b = await body<{ virtualFriends: boolean; voiceChat: boolean }>(req);
	if (typeof b.virtualFriends === 'boolean') await setVirtualFriends(b.virtualFriends, user.id);
	if (typeof b.voiceChat === 'boolean') await setVoiceChat(b.voiceChat, user.id);
	return json({ ...(await getSettings()), voiceReady: voiceConfigured(), missing: missingServerSettings() });
});
