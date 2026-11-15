import { NextResponse } from 'next/server';
import { body, forgetAccountCheck, withUser } from '@/lib/http';
import { deleteAccount } from '@/lib/games';
import { COOKIE } from '@/lib/session';

// POST { password, confirm: 'DELETE' } — deletes the signed-in player's account and signs them out
export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ password: string; confirm: string }>(req);
	const r = await deleteAccount(user, String(b.password || ''), String(b.confirm || ''));
	forgetAccountCheck(user.id);
	const res = NextResponse.json({ ok: true, removed: r.removed });
	res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
	return res;
});
