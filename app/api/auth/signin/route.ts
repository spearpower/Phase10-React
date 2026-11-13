import { NextResponse } from 'next/server';
import { body, fail } from '@/lib/http';
import { signIn } from '@/lib/users';
import { COOKIE, cookieOptions, signSession } from '@/lib/session';
import { GameError } from '@/lib/engine';

export async function POST(req: Request) {
	const b = await body<{ username: string; password: string }>(req);
	try {
		const user = await signIn(b.username || '', b.password || '');
		const res = NextResponse.json({ ok: true, user });
		res.cookies.set(COOKIE, await signSession(user), cookieOptions);
		return res;
	} catch (e) {
		if (e instanceof GameError) return fail(e.message, e.status);
		console.error(e);
		return fail('Can’t sign in right now. Please try again.', 500);
	}
}
