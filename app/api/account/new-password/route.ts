import { NextResponse } from 'next/server';
import { body, forgetAccountCheck, withUser } from '@/lib/http';
import { setNewPassword } from '@/lib/users';
import { COOKIE, cookieOptions, signSession } from '@/lib/session';

// After an admin reset: set a new password and get a normal session cookie back
export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ next: string; repeat: string }>(req);
	const fresh = await setNewPassword(user.id, b.next || '', b.repeat || '');
	forgetAccountCheck(user.id);
	const res = NextResponse.json({ ok: true });
	res.cookies.set(COOKIE, await signSession(fresh), cookieOptions);
	return res;
});
