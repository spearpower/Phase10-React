import { body, json, withUser } from '@/lib/http';
import { inviteFriends } from '@/lib/friends';

// POST { gameId, to: [userId, ...] }
export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ gameId: number; to: number[] }>(req);
	return json({ invited: await inviteFriends(user, Number(b.gameId), Array.isArray(b.to) ? b.to : []) });
});
