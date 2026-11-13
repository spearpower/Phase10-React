import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, readSession, Session } from './session';
import { GameError } from './engine';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export const fail = (message: string, status = 400) => json({ error: message }, status);

export async function currentUser(): Promise<Session | null> {
	const jar = await cookies();
	return readSession(jar.get(COOKIE)?.value);
}

/** Wraps a route handler: requires a signed-in user and turns errors into JSON responses. */
export function withUser<T extends unknown[]>(handler: (user: Session, ...args: T) => Promise<Response>) {
	return async (...args: T): Promise<Response> => {
		const user = await currentUser();
		if (!user) return fail('Please sign in again', 401);
		try {
			return await handler(user, ...args);
		} catch (e) {
			if (e instanceof GameError) return fail(e.message, e.status);
			console.error(e);
			return fail('Something went wrong. Please try again.', 500);
		}
	};
}

export async function body<T>(req: Request): Promise<Partial<T>> {
	try { return (await req.json()) as Partial<T>; } catch { return {}; }
}
