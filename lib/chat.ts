// Table chat: public messages + emojis for the players at one game.
import { sql } from './db';
import { GameError } from './engine';
import { Session } from './session';

export interface ChatMessage { id: number; userId: number; body: string; at: string }

const MAX_LEN = 200;
const MIN_GAP_MS = 700;          // per player: stops accidental double sends and flooding
const lastSent = new Map<string, number>();

async function assertMember(gameId: number, userId: number) {
	const [m] = await sql`select 1 from game_players where game_id = ${gameId} and user_id = ${userId}`;
	if (!m) throw new GameError('Only players at this table can chat', 403);
}

/** Messages after `afterId` (oldest first). The first load returns the latest 60. */
export async function listMessages(user: Session, gameId: number, afterId: number): Promise<ChatMessage[]> {
	await assertMember(gameId, user.id);
	const rows = afterId > 0
		? await sql<{ id: number; user_id: number; body: string; created_at: Date }[]>`
			select id, user_id, body, created_at from game_messages where game_id = ${gameId} and id > ${afterId} order by id limit 100`
		: await sql<{ id: number; user_id: number; body: string; created_at: Date }[]>`
			select * from (select id, user_id, body, created_at from game_messages where game_id = ${gameId} order by id desc limit 60) t order by id`;
	return rows.map(r => ({ id: r.id, userId: r.user_id, body: r.body, at: r.created_at.toISOString() }));
}

/** Clean up a message: no control characters, collapsed whitespace, length limit. */
export function cleanBody(raw: unknown): string {
	const s = String(raw ?? '')
		.replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return Array.from(s).slice(0, MAX_LEN).join('');
}

export async function postMessage(user: Session, gameId: number, raw: unknown): Promise<ChatMessage> {
	const body = cleanBody(raw);
	if (!body) throw new GameError('Type a message first');
	const key = `${gameId}:${user.id}`;
	const now = Date.now();
	if (now - (lastSent.get(key) || 0) < MIN_GAP_MS) throw new GameError('Slow down a little', 429);
	lastSent.set(key, now);
	await assertMember(gameId, user.id);
	const [r] = await sql<{ id: number; created_at: Date }[]>`
		insert into game_messages (game_id, user_id, body) values (${gameId}, ${user.id}, ${body}) returning id, created_at`;
	return { id: r.id, userId: user.id, body, at: r.created_at.toISOString() };
}
