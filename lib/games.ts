// Game service: lobby, start, moves, timers, results. Every write runs in one transaction
// with the game row locked (SELECT ... FOR UPDATE), so simultaneous moves can't interleave.
import type postgres from 'postgres';
import { sql } from './db';
import { Action, apply, autoPlay, AWAY_TURNS, awayPlayer, BotLevel, GameError, GameState, GameView, newGame, removePlayer, viewFor } from './engine';
import { Condition } from './rules';
import { botTurn } from './bot';
import { getSettings } from './settings';
import { notifyGame, notifyLobbyList } from './realtime';
import { after } from 'next/server';
import { alertTurn } from './push';
import { Session } from './session';

type Tx = postgres.TransactionSql<{}>;

export const ROUND_SUMMARY_SECONDS = 8; // extra time on the first turn of a round while players read the summary
const ONLINE_SECONDS = 20;
/** Games with no moves for this long are closed (lobbies: abandoned; games in play: ended, no points). */
export const STALE_HOURS = 24;
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'smart'];
export const asBotLevel = (x: unknown): BotLevel => (BOT_LEVELS.includes(x as BotLevel) ? (x as BotLevel) : 'normal');
const MAX_VIRTUAL_FRIENDS = 5;
/** A Virtual Friend "thinks" for 1.4–2.4 s so people can follow the play. */
const botSeconds = () => 1.4 + Math.random();
const isBotTurn = (st: GameState | null) => !!st && st.turn !== null && !!st.bots?.includes(st.turn);
/** Play whatever is due: a Virtual Friend's turn, or a person's timed-out turn. */
function runDueTurn(st: GameState) {
	return isBotTurn(st) ? botTurn(st, st.turn!) : autoPlay(st);
}

let phaseCache: Record<number, Record<string, Condition[]>> = {};
async function phasesFor(edition: number): Promise<Record<string, Condition[]>> {
	if (!phaseCache[edition]) {
		const rows = await sql<{ phase_no: number; conditions: Condition[] }[]>`
			select phase_no, conditions from phases where edition = ${edition} order by phase_no`;
		if (!rows.length) throw new GameError('Rule set not found');
		phaseCache[edition] = Object.fromEntries(rows.map(r => [String(r.phase_no), r.conditions]));
	}
	return phaseCache[edition];
}
export function _clearPhaseCache() { phaseCache = {}; }

interface GameRow {
	id: number; host_id: number; edition: number; pin: string | null; timer_sec: number; status: string;
	round: number; version: number; state: GameState | null; turn_user_id: number | null;
	turn_deadline: Date | null; next_game_id: number | null;
	end_reason?: string | null; ended_by?: number | null;
}

/** Display name for someone who may not be sitting at the table (e.g. a super admin). */
async function nameOfUser(id: number | null | undefined): Promise<string | null> {
	if (!id) return null;
	const [u] = await sql<{ username: string }[]>`select username from users where id = ${id}`;
	return u?.username ?? null;
}

// ---------- Lobby ----------

export async function createGame(user: Session, pin: string | null, timerSec: number, edition: 1 | 2 = 1): Promise<number> {
	if (pin !== null && !/^\d{4}$/.test(pin)) throw new GameError('The PIN must be 4 digits');
	const id = await sql.begin(async tx => {
		// one open table per host: close any older lobby they left behind
		await tx`update games set status = 'abandoned' where host_id = ${user.id} and status = 'lobby'`;
		const [g] = await tx<{ id: number }[]>`
			insert into games (host_id, pin, timer_sec, edition) values (${user.id}, ${pin}, ${timerSec}, ${edition}) returning id`;
		await tx`insert into game_players (game_id, user_id, seat) values (${g.id}, ${user.id}, 1)`;
		return g.id;
	});
	await notifyLobbyList();
	return id;
}

export async function listOpenGames(user: Session, publicOnly: boolean, search: string) {
	await closeStaleGamesSometimes();
	const s = search.replace(/\D/g, '');
	return sql<{ id: number; private: boolean; host: string; photo: string; players: number; created_at: Date }[]>`
		select g.id, (g.pin is not null) as private, h.username as host, h.photo, g.created_at,
		       (select count(*)::int from game_players p where p.game_id = g.id) as players
		from games g
		join users h on h.id = g.host_id
		join game_players hp on hp.game_id = g.id and hp.user_id = g.host_id
		where g.status = 'lobby'
		  and (hp.last_seen > now() - make_interval(secs => ${ONLINE_SECONDS}) or g.host_id = ${user.id})
		  and (select count(*) from game_players p where p.game_id = g.id) < 6
		  ${publicOnly ? sql`and g.pin is null` : sql``}
		  ${s ? sql`and g.id::text like ${'%' + s + '%'}` : sql``}
		order by g.id desc
		limit 20`;
}

export async function listMyGames(user: Session) {
	await closeStaleGamesSometimes();
	return sql<{ id: number; round: number; host: string; photo: string; players: number; my_turn: boolean }[]>`
		select g.id, g.round, h.username as host, h.photo,
		       (select count(*)::int from game_players p where p.game_id = g.id) as players,
		       (g.turn_user_id = ${user.id}) as my_turn
		from games g
		join game_players me on me.game_id = g.id and me.user_id = ${user.id} and me.left_at is null
		join users h on h.id = g.host_id
		where g.status = 'playing'
		order by g.updated_at desc
		limit 20`;
}

/**
 * Quick Game: sit at the fullest open public table that still has a seat (host online),
 * or open a new public table. Returns where to go.
 */
export async function quickGame(user: Session): Promise<{ id: number; created: boolean }> {
	await closeStaleGamesSometimes();
	const tables = await sql<{ id: number }[]>`
		select g.id
		from games g
		join game_players hp on hp.game_id = g.id and hp.user_id = g.host_id
		where g.status = 'lobby' and g.pin is null and g.host_id <> ${user.id}
		  and hp.last_seen > now() - make_interval(secs => ${ONLINE_SECONDS})
		  and (select count(*) from game_players p where p.game_id = g.id) < 6
		order by (select count(*) from game_players p where p.game_id = g.id) desc, g.id
		limit 5`;
	for (const t of tables) {
		try { await joinGame(user, t.id, null); return { id: t.id, created: false }; }
		catch (e) { if (!(e instanceof GameError)) throw e; } // filled up or started meanwhile: try the next one
	}
	return { id: await createGame(user, null, 40, 1), created: true };
}

/** Quick Game host after the wait: fill the table to 3 with Virtual Friends and start. */
export async function quickFillAndStart(user: Session, gameId: number): Promise<void> {
	const [g] = await sql<{ host_id: number; status: string; players: number }[]>`
		select host_id, status, (select count(*)::int from game_players p where p.game_id = g.id) as players from games g where id = ${gameId}`;
	if (!g) throw new GameError('Game not found', 404);
	if (g.host_id !== user.id) throw new GameError('Only the host can start the game', 403);
	if (g.status !== 'lobby') return;
	for (let n = g.players; n < 3; n++) await addVirtualFriend(user, gameId);
	await startGame(user, gameId, 40, 'normal');
}

export async function joinGame(user: Session, gameId: number, pin: string | null): Promise<'joined' | 'member'> {
	const result = await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		const members = await tx<{ user_id: number; seat: number }[]>`select user_id, seat from game_players where game_id = ${gameId}`;
		if (members.some(m => m.user_id === user.id)) return 'member' as const;
		if (g.status !== 'lobby') throw new GameError('This game has already started', 409);
		if (g.pin && g.pin !== (pin || '')) throw new GameError(pin ? 'That PIN is not right. Try again.' : 'This game needs a PIN', 403);
		if (members.length >= 6) throw new GameError('This table is full (6 players)', 409);
		const taken = new Set(members.map(m => m.seat));
		const seat = [1, 2, 3, 4, 5, 6].find(x => !taken.has(x))!;
		await tx`insert into game_players (game_id, user_id, seat) values (${gameId}, ${user.id}, ${seat})`;
		await bump(tx, gameId);
		return 'joined' as const;
	});
	await ping(gameId);
	return result;
}

/** Shortest sensible reason text: no control characters, max 80 characters. */
export function cleanReason(raw: unknown): string {
	return Array.from(String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 80).join('');
}

async function roleOf(tx: Tx, userId: number): Promise<string> {
	const [u] = await tx<{ role: string }[]>`select role from users where id = ${userId}`;
	return u?.role || 'player';
}

/** Host of the table, or a super admin (any table). */
async function canManage(tx: Tx, g: GameRow, userId: number): Promise<boolean> {
	return g.host_id === userId || (await roleOf(tx, userId)) === 'superadmin';
}

/** Leave a table. In the waiting room no reason is needed; during a game a reason is required. */
export async function leaveGame(user: Session, gameId: number, reasonRaw?: unknown): Promise<void> {
	const reason = cleanReason(reasonRaw);
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.status === 'lobby') {
			if (g.host_id === user.id) await tx`update games set status = 'abandoned' where id = ${gameId}`;
			else await tx`delete from game_players where game_id = ${gameId} and user_id = ${user.id}`;
			await bump(tx, gameId);
			return;
		}
		if (g.status !== 'playing' || !g.state) throw new GameError('This game is not being played', 409);
		if (!reason) throw new GameError('Choose a reason for leaving');
		await takeOut(tx, g, user.id, user.id, reason, `left the game · ${reason}`);
	});
	await ping(gameId);
	await notifyLobbyList();
}

/** Remove a player: the host, or a super admin. Works in the waiting room and during a game. */
export async function kickPlayer(user: Session, gameId: number, target: number, reasonRaw?: unknown): Promise<void> {
	const reason = cleanReason(reasonRaw);
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (!(await canManage(tx, g, user.id))) throw new GameError('Only the host or a super admin can remove players', 403);
		if (target === user.id) throw new GameError('To go yourself, use Leave game');
		if (g.status === 'lobby') {
			await tx`delete from game_players where game_id = ${gameId} and user_id = ${target}`;
			await bump(tx, gameId);
			return;
		}
		if (g.status !== 'playing' || !g.state) throw new GameError('This game is not being played', 409);
		if (!reason) throw new GameError('Choose a reason for removing them');
		await takeOut(tx, g, target, user.id, reason, `was removed by {${user.id}} · ${reason}`);
	});
	await ping(gameId);
}

/** End a game early (host or super admin). No leaderboard points are given. */
export async function endGame(user: Session, gameId: number, reasonRaw: unknown): Promise<void> {
	const reason = cleanReason(reasonRaw);
	if (!reason) throw new GameError('Choose a reason for ending the game');
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (!(await canManage(tx, g, user.id))) throw new GameError('Only the host or a super admin can end the game', 403);
		if (g.status !== 'playing' || !g.state) throw new GameError('This game is not being played', 409);
		await finishEarly(tx, g, g.state, user.id, reason);
	});
	await ping(gameId);
	await notifyLobbyList();
}

/** Take one player out of a running game; end it if fewer than 2 players (or no people) remain. */
async function takeOut(tx: Tx, g: GameRow, target: number, by: number | null, reason: string, note: string, roundBefore = g.state!.round) {
	const state = g.state!;
	if (!state.players[String(target)]) throw new GameError('That player is not in this game', 404);
	const left = removePlayer(state, target, note);
	await tx`update game_players set left_at = now(), left_reason = ${reason}, left_by = ${by} where game_id = ${g.id} and user_id = ${target}`;
	const people = state.order.filter(id => !state.bots?.includes(id)).length;
	if (left < 2 || people === 0) return finishEarly(tx, g, state, null, left < 2 ? 'Not enough players left' : 'Only Virtual Friends were left');
	return save(tx, g, state, state.round !== roundBefore);
}

export const AWAY_REASON = `Away · missed ${AWAY_TURNS} turns in a row`;

/** After a timed-out turn: save, taking the player out if they've now missed AWAY_TURNS turns in a row. */
async function saveAfterTimeout(tx: Tx, g: GameRow, state: GameState, timedOut: number | null, roundBefore: number) {
	const away = awayPlayer(state, timedOut);
	if (away === null) return save(tx, g, state, state.round !== roundBefore);
	return takeOut(tx, { ...g, state }, away, null, AWAY_REASON, `was taken out · ${AWAY_REASON.toLowerCase()}`, roundBefore);
}

async function finishEarly(tx: Tx, g: GameRow, state: GameState, by: number | null, reason: string) {
	state.turn = null;
	state.log.unshift(by ? `Game ended by {${by}} · ${reason}` : `Game ended · ${reason}`);
	state.log.length = Math.min(state.log.length, 6);
	const [row] = await tx<{ version: number; turn_deadline: Date | null; status: string }[]>`
		update games set state = ${tx.json(state as never)}, status = 'ended', end_reason = ${reason}, ended_by = ${by},
			turn_user_id = null, turn_deadline = null, finished_at = now(), version = version + 1
		where id = ${g.id}
		returning version, turn_deadline, status`;
	return row;
}

// ---------- Stuck games ----------

let lastSweep = 0;
/** Runs the stale-game sweep at most every 10 minutes per server instance (cheap, called from lists). */
async function closeStaleGamesSometimes() {
	if (Date.now() - lastSweep < 10 * 60 * 1000) return;
	lastSweep = Date.now();
	try { await closeStaleGames(); } catch (e) { console.error('stale sweep', e); }
}

/** Close games nobody has touched for STALE_HOURS. Returns how many lobbies and games were closed. */
export async function closeStaleGames(): Promise<{ lobbies: number; games: number }> {
	const reason = `No moves for ${STALE_HOURS} hours`;
	const lobbies = await sql`
		update games set status = 'abandoned'
		where status = 'lobby' and updated_at < now() - make_interval(hours => ${STALE_HOURS})
		returning id`;
	const games = await sql<{ id: number; version: number }[]>`
		update games set status = 'ended', end_reason = ${reason}, ended_by = null,
			turn_user_id = null, turn_deadline = null, finished_at = now(), version = version + 1,
			state = case when state is null then null else jsonb_set(
				jsonb_set(state, '{turn}', 'null'::jsonb), '{log}',
				jsonb_build_array(${'Game ended · ' + reason}::text) || coalesce(state->'log', '[]'::jsonb)) end
		where status = 'playing' and updated_at < now() - make_interval(hours => ${STALE_HOURS})
		returning id, version`;
	for (const g of games) await notifyGame(g.id, g.version);
	if (lobbies.length || games.length) await notifyLobbyList();
	return { lobbies: lobbies.length, games: games.length };
}

/** Admin overview: games being played and open waiting rooms (last 24 h), with people and/or Virtual Friends. */
export async function liveTables() {
	return sql<{ id: number; status: 'lobby' | 'playing'; private: boolean; edition: number; host: string; round: number; timer_sec: number; updated_at: Date; created_at: Date; with_bots: boolean; people: number; players: { id: number; username: string; photo: string; isBot: boolean }[]; turn: string | null }[]>`
		select g.id, g.status, (g.pin is not null) as private, g.edition, h.username as host, g.round, g.timer_sec, g.updated_at, g.created_at,
		       exists(select 1 from game_players p join users u on u.id = p.user_id where p.game_id = g.id and p.left_at is null and u.is_bot) as with_bots,
		       (select count(*)::int from game_players p join users u on u.id = p.user_id where p.game_id = g.id and p.left_at is null and not u.is_bot) as people,
		       (select coalesce(json_agg(json_build_object('id', u.id, 'username', u.username, 'photo', u.photo, 'isBot', u.is_bot) order by p.seat), '[]'::json)
		          from game_players p join users u on u.id = p.user_id where p.game_id = g.id and p.left_at is null) as players,
		       (select username from users where id = g.turn_user_id) as turn
		from games g join users h on h.id = g.host_id
		where g.status = 'playing' or (g.status = 'lobby' and g.updated_at > now() - interval '24 hours')
		order by g.updated_at desc
		limit 200`;
}

export async function startGame(user: Session, gameId: number, timerSec: number, level: BotLevel = 'normal'): Promise<void> {
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.host_id !== user.id) throw new GameError('Only the host can start the game', 403);
		if (g.status !== 'lobby') throw new GameError('The game has already started', 409);
		const players = await tx<{ user_id: number; is_bot: boolean }[]>`
			select p.user_id, u.is_bot from game_players p join users u on u.id = p.user_id where p.game_id = ${gameId} order by p.seat`;
		if (players.length < 2) throw new GameError('You need at least 2 players to start');
		const bots = players.filter(p => p.is_bot).map(p => p.user_id);
		if (bots.length && !(await getSettings()).virtualFriends) throw new GameError('Virtual Friends are switched off. Remove them to start.', 409);
		const state = newGame(g.edition, players.map(p => p.user_id), await phasesFor(g.edition));
		state.bots = bots;
		if (bots.length) state.botLevel = level;
		await tx`update games set timer_sec = ${timerSec} where id = ${gameId}`;
		await save(tx, { ...g, timer_sec: timerSec }, state, false); // round 1: no summary to read
	});
	await ping(gameId);
	await notifyLobbyList();
}

export async function playAgain(user: Session, gameId: number): Promise<number> {
	const newId = await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.host_id !== user.id) throw new GameError('Only the host can start a new game', 403);
		if (g.status !== 'finished' && g.status !== 'ended') throw new GameError('This game hasn’t finished yet', 409);
		if (g.next_game_id) return g.next_game_id;
		await tx`update games set status = 'abandoned' where host_id = ${user.id} and status = 'lobby'`;
		const [ng] = await tx<{ id: number }[]>`
			insert into games (host_id, edition, pin, timer_sec) values (${user.id}, ${g.edition}, ${g.pin}, ${g.timer_sec}) returning id`;
		await tx`insert into game_players (game_id, user_id, seat)
			select ${ng.id}, user_id, seat from game_players where game_id = ${gameId}`;
		await tx`update games set next_game_id = ${ng.id} where id = ${gameId}`;
		await bump(tx, gameId);
		return ng.id;
	});
	await ping(gameId);
	await notifyLobbyList();
	return newId;
}

/** Host adds one Virtual Friend to their waiting room. */
export async function addVirtualFriend(user: Session, gameId: number): Promise<void> {
	if (!(await getSettings()).virtualFriends) throw new GameError('Virtual Friends are switched off by the admin', 403);
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.host_id !== user.id) throw new GameError('Only the host can add Virtual Friends', 403);
		if (g.status !== 'lobby') throw new GameError('The game has already started', 409);
		const seats = await tx<{ user_id: number; seat: number; is_bot: boolean }[]>`
			select p.user_id, p.seat, u.is_bot from game_players p join users u on u.id = p.user_id where p.game_id = ${gameId}`;
		if (seats.length >= 6) throw new GameError('This table is full (6 players)', 409);
		if (seats.filter(x => x.is_bot).length >= MAX_VIRTUAL_FRIENDS) throw new GameError('A table can have up to 5 Virtual Friends', 409);
		const [bot] = await tx<{ id: number }[]>`
			select id from users where is_bot and status = 'active'
			  and id not in (select user_id from game_players where game_id = ${gameId})
			order by random() limit 1`;
		if (!bot) throw new GameError('No more Virtual Friends are free', 409);
		const taken = new Set(seats.map(x => x.seat));
		const seat = [1, 2, 3, 4, 5, 6].find(x => !taken.has(x))!;
		await tx`insert into game_players (game_id, user_id, seat) values (${gameId}, ${bot.id}, ${seat})`;
		await bump(tx, gameId);
	});
	await ping(gameId);
}

/** One tap: a private table with `count` Virtual Friends that starts right away. */
export async function startPractice(user: Session, count: number, timerSec: number, level: BotLevel = 'normal', edition: 1 | 2 = 1): Promise<number> {
	if (!(await getSettings()).virtualFriends) throw new GameError('Virtual Friends are switched off by the admin', 403);
	const n = Math.max(1, Math.min(MAX_VIRTUAL_FRIENDS, Math.floor(count)));
	const phases = await phasesFor(edition);
	return sql.begin(async tx => {
		await tx`update games set status = 'abandoned' where host_id = ${user.id} and status = 'lobby'`;
		const pin = String(1000 + Math.floor(Math.random() * 9000)); // private, so it never shows in Open tables
		const [g] = await tx<GameRow[]>`insert into games (host_id, pin, timer_sec, edition) values (${user.id}, ${pin}, ${timerSec}, ${edition}) returning *`;
		const bots = await tx<{ id: number }[]>`select id from users where is_bot and status = 'active' order by random() limit ${n}`;
		if (!bots.length) throw new GameError('No Virtual Friends are set up yet. Ask the admin to run the database update.', 409);
		const ids = [user.id, ...bots.map(b => b.id)];
		for (let i = 0; i < ids.length; i++) await tx`insert into game_players (game_id, user_id, seat) values (${g.id}, ${ids[i]}, ${i + 1})`;
		const state = newGame(edition, ids, phases);
		state.bots = bots.map(b => b.id);
		state.botLevel = level;
		await save(tx, g, state, false);
		return g.id;
	});
}

// ---------- Playing ----------

export interface MoveResult {
	changed: boolean; status: string; version: number; deadline: string | null; serverNow: string;
	nextGameId: number | null; view: GameView | null;
}

/** Apply one move. Fast path: ~4 database round trips, answered from the saved state (no re-read). */
export async function move(user: Session, gameId: number, action: Action): Promise<MoveResult> {
	const { orderShuffle } = await getSettings(); // cached; applies to games already being played
	return sql.begin(async tx => {
		const g = await lockAsMember(tx, gameId, user.id);
		if (g.status === 'ended') throw new GameError('This game was ended', 409);
		if (g.status !== 'playing' || !g.state) throw new GameError('This game is not being played right now', 409);
		const state = g.state;
		const before = state.round;
		state.shuffleOrder = orderShuffle;
		if (action.type === 'timeout') {
			// Any player's device may report the timer; the server decides if it really ran out
			if (!g.turn_deadline || g.turn_deadline.getTime() > Date.now() + 1000) return result(g, state, user.id, false);
			const timedOut = state.turn;
			runDueTurn(state);
			const saved = await saveAfterTimeout(tx, g, state, timedOut, before);
			return result({ ...g, ...saved }, state, user.id, true);
		}
		apply(state, user.id, action);
		const saved = await save(tx, g, state, state.round !== before);
		return result({ ...g, ...saved }, state, user.id, true);
	});
}

function result(g: Pick<GameRow, 'status' | 'version' | 'turn_deadline' | 'next_game_id'>, state: GameState, me: number, changed: boolean): MoveResult {
	return {
		changed, status: g.status, version: g.version,
		deadline: g.turn_deadline ? new Date(g.turn_deadline).toISOString() : null,
		serverNow: new Date().toISOString(), nextGameId: g.next_game_id, view: state.players[String(me)] ? viewFor(state, me) : null, // null: they were just taken out
	};
}

/** Read a player's view. Also records they're online and applies an overdue timeout. */
export async function getGame(user: Session, gameId: number) {
	await sql`update game_players set last_seen = now() where game_id = ${gameId} and user_id = ${user.id}`;
	let [g] = await sql<(GameRow & { chat_last: number | null })[]>`
		select g.*, (select max(m.id) from game_messages m where m.game_id = g.id) as chat_last from games g where g.id = ${gameId}`;
	if (!g) throw new GameError('Game not found', 404);

	// Turn timer ran out and nobody reported it (e.g. that player closed the app): play it now
	// (Virtual Friends move as soon as their thinking time is up; people get a 2 s grace)
	const grace = (row: GameRow) => (isBotTurn(row.state) ? 0 : 2000);
	if (g.status === 'playing' && g.turn_deadline && g.turn_deadline.getTime() < Date.now() - grace(g)) {
		let changed = false;
		await sql.begin(async tx => {
			const locked = await lock(tx, gameId);
			if (locked.status !== 'playing' || !locked.state || !locked.turn_deadline || locked.turn_deadline.getTime() >= Date.now() - grace(locked)) return;
			const before = locked.state.round;
			const timedOut = locked.state.turn;
			locked.state.shuffleOrder = (await getSettings()).orderShuffle;
			runDueTurn(locked.state);
			await saveAfterTimeout(tx, locked, locked.state, timedOut, before);
			changed = true;
		});
		if (changed) {
			after(() => alertTurn(gameId));
			await ping(gameId);
			[g] = await sql<(GameRow & { chat_last: number | null })[]>`
				select g.*, (select max(m.id) from game_messages m where m.game_id = g.id) as chat_last from games g where g.id = ${gameId}`;
		}
	}

	const players = await sql<{ user_id: number; seat: number; username: string; photo: string; online: boolean; is_bot: boolean; left_at: Date | null; left_reason: string | null; left_by: number | null; role: string }[]>`
		select p.user_id, p.seat, u.username, u.photo, u.is_bot, p.left_at, p.left_reason, p.left_by, u.role,
		       (u.is_bot or p.last_seen > now() - make_interval(secs => ${ONLINE_SECONDS})) as online
		from game_players p join users u on u.id = p.user_id
		where p.game_id = ${gameId} order by p.seat`;
	const meRow = players.find(p => p.user_id === user.id);
	const isMember = !!meRow && !meRow.left_at;
	const [{ role: myRole } = { role: 'player' }] = await sql<{ role: string }[]>`select role from users where id = ${user.id}`;
	const isAdmin = myRole === 'admin' || myRole === 'superadmin';
	if (!meRow && g.status !== 'lobby' && !isAdmin) throw new GameError('You are not in this game', 403);

	const view: GameView | null = g.state && isMember ? viewFor(g.state, user.id) : null;
	// Admins not at the table can watch: everyone's table, never anyone's hand
	const watch: GameView | null = g.state && !meRow && isAdmin ? viewFor(g.state, -1) : null;
	return {
		id: g.id,
		me: user.id,
		status: g.status,
		edition: g.edition,
		hostId: g.host_id,
		isMember,
		pin: isMember ? g.pin : null,
		private: !!g.pin,
		timerSec: g.timer_sec,
		version: g.version,
		deadline: g.turn_deadline ? g.turn_deadline.toISOString() : null,
		serverNow: new Date().toISOString(),
		nextGameId: g.next_game_id,
		chatLast: isMember ? g.chat_last ?? 0 : 0,
		players: players.map(p => ({ id: p.user_id, seat: p.seat, username: p.username, photo: p.photo, online: p.online, isBot: p.is_bot, left: !!p.left_at })),
		canManage: g.host_id === user.id || myRole === 'superadmin',
		superAdmin: myRole === 'superadmin',
		myLeft: meRow?.left_at ? { by: meRow.left_by, byName: await nameOfUser(meRow.left_by), reason: meRow.left_reason } : null,
		ended: g.status === 'ended' ? { by: g.ended_by ?? null, byName: await nameOfUser(g.ended_by ?? null), reason: g.end_reason ?? '' } : null,
		practice: !!g.state?.bots?.length,
		view,
		watch,
	};
}

export async function leaderboard() {
	return sql<{ id: number; username: string; photo: string; points: number; games: number }[]>`
		with month as (
			select date_trunc('month', now() at time zone 'Africa/Kampala') at time zone 'Africa/Kampala' as start
		)
		select u.id, u.username, u.photo, sum(gp.points)::int as points, count(*)::int as games
		from game_points gp join users u on u.id = gp.user_id, month
		where gp.created_at >= month.start and not u.is_bot
		group by u.id order by points desc, games asc, u.username
		limit 50`;
}

// ---------- helpers ----------

async function lock(tx: Tx, gameId: number): Promise<GameRow> {
	const [g] = await tx<GameRow[]>`select * from games where id = ${gameId} for update`;
	if (!g) throw new GameError('Game not found', 404);
	return g;
}

async function lockAsMember(tx: Tx, gameId: number, userId: number): Promise<GameRow> {
	const [g] = await tx<(GameRow & { is_member: boolean })[]>`
		select g.*, exists(select 1 from game_players p where p.game_id = g.id and p.user_id = ${userId} and p.left_at is null) as is_member
		from games g where g.id = ${gameId} for update`;
	if (!g) throw new GameError('Game not found', 404);
	if (!g.is_member) throw new GameError('You are not in this game', 403);
	return g;
}

async function member(tx: Tx, gameId: number, userId: number) {
	const [m] = await tx`select 1 from game_players where game_id = ${gameId} and user_id = ${userId}`;
	if (!m) throw new GameError('You are not in this game', 403);
}

async function bump(tx: Tx, gameId: number) {
	await tx`update games set version = version + 1 where id = ${gameId}`;
}

/** Persist engine state + turn deadline. Player progress only changes at round end, so it's written only then. */
async function save(tx: Tx, g: GameRow, state: GameState, newRound: boolean) {
	const finished = !!state.finished;
	const extra = newRound ? ROUND_SUMMARY_SECONDS : 0;
	const secs = finished || !state.turn ? null
		: isBotTurn(state) ? botSeconds() + extra
		: g.timer_sec ? g.timer_sec + extra : null;
	const [row] = await tx<{ version: number; turn_deadline: Date | null; status: string }[]>`
		update games set
			state = ${tx.json(state as never)},
			status = ${finished ? 'finished' : 'playing'},
			round = ${state.round},
			version = version + 1,
			turn_user_id = ${state.turn},
			turn_deadline = ${secs === null ? null : tx`now() + make_interval(secs => ${secs})`},
			finished_at = ${finished ? tx`now()` : null}
		where id = ${g.id}
		returning version, turn_deadline, status`;
	if (newRound || finished) {
		const rows = state.order.map(id => {
			const p = state.players[String(id)];
			return { uid: id, phase: p.phase, score: p.score, rank: state.finished?.standings.find(x => x.id === id)?.rank ?? null };
		});
		await tx`
			update game_players as gp set phase = v.phase, score = v.score, final_rank = v.rank
			from jsonb_to_recordset(${tx.json(rows as never)}) as v(uid bigint, phase int, score int, rank int)
			where gp.game_id = ${g.id} and gp.user_id = v.uid`;
	}
	// Games with Virtual Friends are practice: no leaderboard points
	if (state.finished && !state.bots?.length) {
		const pts = state.finished.standings.map(x => ({ user_id: x.id, game_id: g.id, points: x.points }));
		await tx`insert into game_points ${tx(pts, 'user_id', 'game_id', 'points')} on conflict (game_id, user_id) do nothing`;
	}
	return row;
}

async function ping(gameId: number) {
	const [g] = await sql<{ version: number }[]>`select version from games where id = ${gameId}`;
	if (g) await notifyGame(gameId, g.version);
}
