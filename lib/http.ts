import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, readSession, Session } from './session';
import { GameError } from './engine';
import { sql } from './db';

/** Per-instance cache of "account is fine" (active, no forced password change), refreshed every minute. */
const okUntil = new Map<number, number>();
export const forgetAccountCheck = (id: number) => okUntil.delete(id);

/** Suspended or must-change-password accounts are stopped here. Also records "last seen" (for friends). */
async function accountCheck(user: Session, path: string): Promise<Response | null> {
	const passwordRoute = path.startsWith('/api/account/new-password') || path.startsWith('/api/auth/');
	// signed in with a temporary password: the cookie says so, no database needed
	if (user.mustChange && !passwordRoute) return fail('Choose a new password first', 428);
	if ((okUntil.get(user.id) || 0) > Date.now()) return null;
	const [row] = await sql<{ status: string; must_change_password: boolean }[]>`
		update users set last_seen_at = now() where id = ${user.id} returning status, must_change_password`.catch(() => [] as never[]);
	if (!row) return null; // database hiccup or column missing: don't lock people out
	if (row.status !== 'active') return fail('This account is suspended. Contact the admin.', 401);
	if (row.must_change_password && !passwordRoute) {
		return fail('Choose a new password first', 428);
	}
	if (!row.must_change_password) okUntil.set(user.id, Date.now() + 60000);
	return null;
}

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
		const req = args.find(a => a instanceof Request) as Request | undefined;
		const blocked = await accountCheck(user, req ? new URL(req.url).pathname : '');
		if (blocked) return blocked;
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
