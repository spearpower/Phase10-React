// Admin: player management (search, reset password, suspend, roles) and the watch list of tables.
import { randomInt } from 'crypto';
import { sql } from './db';
import { GameError } from './engine';
import { Session } from './session';

type Role = 'player' | 'admin' | 'superadmin';

export async function roleOf(id: number): Promise<Role> {
	const [u] = await sql<{ role: Role }[]>`select role from users where id = ${id} and not is_bot and status = 'active'`;
	return u?.role || 'player';
}

export async function requireAdmin(user: Session): Promise<Role> {
	const r = await roleOf(user.id);
	if (r !== 'admin' && r !== 'superadmin') throw new GameError('Admins only', 403);
	return r;
}

export interface PlayerRow {
	id: number; username: string; fullname: string; role: Role; status: string; photo: string;
	email: string | null; phone: string | null; lastSeen: string | null; joined: string; games: number; mustChange: boolean;
}

export async function listPlayers(user: Session, search: string): Promise<PlayerRow[]> {
	await requireAdmin(user);
	const q = search.trim().slice(0, 40);
	const rows = await sql<{ id: number; username: string; fullname: string; role: Role; status: string; photo: string; email: string | null; phone: string | null; last_seen: Date | null; created_at: Date; games: number; must_change_password: boolean }[]>`
		select u.id, u.username, u.fullname, u.role, u.status, u.photo, u.email, u.phone, u.created_at, u.must_change_password,
		       coalesce(u.last_seen_at, u.last_login_at) as last_seen,
		       (select count(*)::int from game_players p join games g on g.id = p.game_id where p.user_id = u.id and g.status in ('playing', 'finished', 'ended')) as games
		from users u
		where not u.is_bot
		  ${q ? sql`and (u.username ilike ${'%' + q + '%'} or u.fullname ilike ${'%' + q + '%'})` : sql``}
		order by coalesce(u.last_seen_at, u.last_login_at, u.created_at) desc nulls last
		limit 200`;
	return rows.map(r => ({
		id: r.id, username: r.username, fullname: r.fullname, role: r.role, status: r.status, photo: r.photo, email: r.email, phone: r.phone,
		lastSeen: r.last_seen ? r.last_seen.toISOString() : null, joined: r.created_at.toISOString(), games: r.games, mustChange: r.must_change_password,
	}));
}

/** Who may act on whom: admins on players only; the super admin on anyone but themselves. */
async function target(actor: Session, targetId: number) {
	const myRole = await requireAdmin(actor);
	if (targetId === actor.id) throw new GameError('Use your Account page to change your own details', 409);
	const [t] = await sql<{ id: number; username: string; role: Role }[]>`select id, username, role from users where id = ${targetId} and not is_bot`;
	if (!t) throw new GameError('Player not found', 404);
	if (myRole !== 'superadmin' && t.role !== 'player') throw new GameError('Only the super admin can change another admin', 403);
	return { myRole, t };
}

/** Easy to read out or type on a phone: no 0/O or 1/l/I. */
function tempPassword(): string {
	const letters = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789';
	const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join('');
	return `${pick(letters, 4)}-${pick(digits, 4)}`;
}

export async function resetPassword(actor: Session, targetId: number): Promise<{ username: string; temporary: string }> {
	const { t } = await target(actor, targetId);
	const temporary = tempPassword();
	await sql`update users set password_hash = app_hash_password(${temporary}), must_change_password = true where id = ${t.id}`;
	console.log('[admin]', JSON.stringify({ by: actor.username, action: 'reset-password', target: t.username }));
	return { username: t.username, temporary };
}

export async function setStatus(actor: Session, targetId: number, status: 'active' | 'suspended'): Promise<void> {
	const { t } = await target(actor, targetId);
	await sql`update users set status = ${status} where id = ${t.id}`;
	console.log('[admin]', JSON.stringify({ by: actor.username, action: status === 'suspended' ? 'suspend' : 'reactivate', target: t.username }));
}

export async function setRole(actor: Session, targetId: number, role: 'player' | 'admin'): Promise<void> {
	const { myRole, t } = await target(actor, targetId);
	if (myRole !== 'superadmin') throw new GameError('Only the super admin can change roles', 403);
	if (t.role === 'superadmin') throw new GameError('The super admin’s role can’t be changed here', 409);
	await sql`update users set role = ${role} where id = ${t.id}`;
	console.log('[admin]', JSON.stringify({ by: actor.username, action: 'role', role, target: t.username }));
}
