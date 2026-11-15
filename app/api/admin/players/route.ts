import { json, withUser } from '@/lib/http';
import { listPlayers, roleOf } from '@/lib/admin';

export const GET = withUser(async (user, req: Request) => {
	const q = new URL(req.url).searchParams.get('q') || '';
	const players = await listPlayers(user, q);
	return json({ players, myRole: await roleOf(user.id), me: user.id });
});
