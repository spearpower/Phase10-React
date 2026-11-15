import { body, fail, json, withUser } from '@/lib/http';
import { friendsView, removeFriend, requestFriend, respondFriend } from '@/lib/friends';

export const GET = withUser(async user => json(await friendsView(user)));

// POST { action: 'request' | 'accept' | 'decline' | 'remove', userId }
export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ action: string; userId: number }>(req);
	const other = Number(b.userId);
	if (!other) return fail('Choose a player');
	switch (b.action) {
		case 'request': return json({ result: await requestFriend(user, other) });
		case 'accept': await respondFriend(user, other, true); return json({ ok: true });
		case 'decline': await respondFriend(user, other, false); return json({ ok: true });
		case 'remove': await removeFriend(user, other); return json({ ok: true });
		default: return fail('Unknown action');
	}
});
