import { NextResponse } from 'next/server';
import { body, fail } from '@/lib/http';
import { signUp, SignUpInput } from '@/lib/users';
import { COOKIE, cookieOptions, signSession } from '@/lib/session';
import { GameError } from '@/lib/engine';

export async function POST(req: Request) {
	try {
		const user = await signUp(await body<SignUpInput>(req));
		const res = NextResponse.json({ ok: true, user });
		res.cookies.set(COOKIE, await signSession(user), cookieOptions);
		return res;
	} catch (e) {
		if (e instanceof GameError) return fail(e.message, e.status);
		if ((e as { code?: string }).code === '23505') return fail('That username is taken. Try another.', 409);
		console.error(e);
		return fail('Can’t create the account right now. Please try again.', 500);
	}
}
