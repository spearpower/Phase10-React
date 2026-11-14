import { NextResponse } from 'next/server';
import { body, json, withUser } from '@/lib/http';
import { getAccount, updateAccount, AccountUpdate } from '@/lib/users';
import { COOKIE, cookieOptions, signSession } from '@/lib/session';

export const GET = withUser(async user => json(await getAccount(user.id)));

export const POST = withUser(async (user, req: Request) => {
	const session = await updateAccount(user.id, await body<AccountUpdate>(req));
	const res = NextResponse.json({ ok: true, account: await getAccount(user.id) });
	res.cookies.set(COOKIE, await signSession(session), cookieOptions); // keep the cookie's name/avatar in step
	return res;
});
