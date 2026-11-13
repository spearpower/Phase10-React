import { randomInt } from 'crypto';
import { sql } from './db';
import { GameError } from './engine';
import { Session } from './session';

interface UserRow { id: number; username: string; photo: string; role: 'player' | 'admin'; status: string; ok: boolean }

export async function signIn(username: string, password: string): Promise<Session> {
	const u = (username || '').trim();
	if (!u || !password) throw new GameError('Enter your username and password');
	const [row] = await sql<UserRow[]>`
		select id, username, photo, role, status, app_check_password(${password}, password_hash) as ok
		from users where lower(username) = lower(${u})`;
	// Same message for unknown user and wrong password, so usernames can't be probed
	if (!row || !row.ok) throw new GameError('That username and password don’t match', 401);
	if (row.status !== 'active') throw new GameError('This account is suspended. Contact the admin.', 403);
	await sql`update users set last_login_at = now() where id = ${row.id}`;
	return { id: row.id, username: row.username, photo: row.photo, role: row.role };
}

export interface SignUpInput { fullname: string; email: string; phone: string; username: string; password: string; repassword: string }

export async function signUp(input: Partial<SignUpInput>): Promise<Session> {
	const fullname = (input.fullname || '').trim();
	const username = (input.username || '').trim();
	const email = (input.email || '').trim() || null;
	const phone = (input.phone || '').replace(/\D/g, '') || null;
	const password = input.password || '';
	if (!fullname) throw new GameError('Enter your full name');
	if (!/^[A-Za-z0-9]{2,20}$/.test(username)) throw new GameError('Username: 2–20 letters or numbers, no spaces');
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GameError('That email doesn’t look right');
	if (phone && (phone.length < 9 || phone.length > 13)) throw new GameError('That phone number doesn’t look right');
	if (password.length < 6) throw new GameError('Use a password of at least 6 characters');
	if (password !== input.repassword) throw new GameError('The two passwords don’t match');

	const [taken] = await sql`select 1 from users where lower(username) = lower(${username})`;
	if (taken) throw new GameError('That username is taken. Try another.', 409);
	const photo = `${randomInt(1, 11)}.png`;
	const [row] = await sql<{ id: number }[]>`
		insert into users (username, password_hash, fullname, email, phone, photo)
		values (${username}, app_hash_password(${password}), ${fullname}, ${email}, ${phone}, ${photo})
		returning id`;
	return { id: row.id, username, photo, role: 'player' };
}
