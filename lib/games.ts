// Game service: lobby, start, moves, timers, results. Every write runs in one transaction
// with the game row locked (SELECT ... FOR UPDATE), so simultaneous moves can't interleave.
import type postgres from 'postgres';
import { sql } from './db';
import { Action, apply, autoPlay, GameError, GameState, GameView, newGame, viewFor } from './engine';
import { Condition } from './rules';
import { notifyGame, notifyLobbyList } from './realtime';
import { Session } from './session';

type Tx = postgres.TransactionSql<{}>;

export const ROUND_SUMMARY_SECONDS = 8; // extra time on the first turn of a round while players read the summary
const ONLINE_SECONDS = 20;

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
}

// ---------- Lobby ----------

export async function createGame(user: Session, pin: string | null, timerSec: number): Promise<number> {
	if (pin !== null && !/^\d{4}$/.test(pin)) throw new GameError('The PIN must be 4 digits');
	const id = await sql.begin(async tx => {
		// one open table per host: close any older lobby they left behind
		await tx`update games set status = 'abandoned' where host_id = ${user.id} and status = 'lobby'`;
		const [g] = await tx<{ id: number }[]>`
			insert into games (host_id, pin, timer_sec) values (${user.id}, ${pin}, ${timerSec}) returning id`;
		await tx`insert into game_players (game_id, user_id, seat) values (${g.id}, ${user.id}, 1)`;
		return g.id;
	});
	await notifyLobbyList();
	return id;
}

export async function listOpenGames(user: Session, publicOnly: boolean, search: string) {
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
	return sql<{ id: number; round: number; host: string; photo: string; players: number; my_turn: boolean }[]>`
		select g.id, g.round, h.username as host, h.photo,
		       (select count(*)::int from game_players p where p.game_id = g.id) as players,
		       (g.turn_user_id = ${user.id}) as my_turn
		from games g
		join game_players me on me.game_id = g.id and me.user_id = ${user.id}
		join users h on h.id = g.host_id
		where g.status = 'playing'
		order by g.updated_at desc
		limit 20`;
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

export async function leaveGame(user: Session, gameId: number): Promise<void> {
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.status !== 'lobby') throw new GameError('You can only leave before the game starts. Your game is saved; rejoin from Continue.', 409);
		if (g.host_id === user.id) {
			await tx`update games set status = 'abandoned' where id = ${gameId}`;
		} else {
			await tx`delete from game_players where game_id = ${gameId} and user_id = ${user.id}`;
		}
		await bump(tx, gameId);
	});
	await ping(gameId);
	await notifyLobbyList();
}

export async function kickPlayer(user: Session, gameId: number, target: number): Promise<void> {
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.host_id !== user.id) throw new GameError('Only the host can remove players', 403);
		if (g.status !== 'lobby') throw new GameError('The game has already started', 409);
		if (target === user.id) throw new GameError('You can’t remove yourself');
		await tx`delete from game_players where game_id = ${gameId} and user_id = ${target}`;
		await bump(tx, gameId);
	});
	await ping(gameId);
}

export async function startGame(user: Session, gameId: number, timerSec: number): Promise<void> {
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.host_id !== user.id) throw new GameError('Only the host can start the game', 403);
		if (g.status !== 'lobby') throw new GameError('The game has already started', 409);
		const players = await tx<{ user_id: number }[]>`select user_id from game_players where game_id = ${gameId} order by seat`;
		if (players.length < 2) throw new GameError('You need at least 2 players to start');
		const state = newGame(g.edition, players.map(p => p.user_id), await phasesFor(g.edition));
		await tx`update games set timer_sec = ${timerSec} where id = ${gameId}`;
		await save(tx, { ...g, timer_sec: timerSec }, state, true);
	});
	await ping(gameId);
	await notifyLobbyList();
}

export async function playAgain(user: Session, gameId: number): Promise<number> {
	const newId = await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.host_id !== user.id) throw new GameError('Only the host can start a new game', 403);
		if (g.status !== 'finished') throw new GameError('This game hasn’t finished yet', 409);
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

// ---------- Playing ----------

export async function move(user: Session, gameId: number, action: Action): Promise<void> {
	let changed = false;
	await sql.begin(async tx => {
		const g = await lock(tx, gameId);
		if (g.status !== 'playing' || !g.state) throw new GameError('This game is not being played right now', 409);
		await member(tx, gameId, user.id);
		const state = g.state;
		if (action.type === 'timeout') {
			// Any player's device may report the timer; the server decides if it really ran out
			if (!g.turn_deadline || g.turn_deadline.getTime() > Date.now() + 1000) return;
			const before = state.round;
			autoPlay(state);
			await save(tx, g, state, state.round !== before);
		} else {
			const before = state.round;
			apply(state, user.id, action);
			await save(tx, g, state, state.round !== before);
		}
		changed = true;
	});
	if (changed) await ping(gameId);
}

/** Read a player's view. Also records they're online and applies an overdue timeout. */
export async function getGame(user: Session, gameId: number) {
	await sql`update game_players set last_seen = now() where game_id = ${gameId} and user_id = ${user.id}`;
	let [g] = await sql<GameRow[]>`select * from games where id = ${gameId}`;
	if (!g) throw new GameError('Game not found', 404);

	// Turn timer ran out and nobody reported it (e.g. that player closed the app): play it now
	if (g.status === 'playing' && g.turn_deadline && g.turn_deadline.getTime() < Date.now() - 2000) {
		let changed = false;
		await sql.begin(async tx => {
			const locked = await lock(tx, gameId);
			if (locked.status !== 'playing' || !locked.state || !locked.turn_deadline || locked.turn_deadline.getTime() >= Date.now() - 2000) return;
			const before = locked.state.round;
			autoPlay(locked.state);
			await save(tx, locked, locked.state, locked.state.round !== before);
			changed = true;
		});
		if (changed) { await ping(gameId); [g] = await sql<GameRow[]>`select * from games where id = ${gameId}`; }
	}

	const players = await sql<{ user_id: number; seat: number; username: string; photo: string; online: boolean }[]>`
		select p.user_id, p.seat, u.username, u.photo, (p.last_seen > now() - make_interval(secs => ${ONLINE_SECONDS})) as online
		from game_players p join users u on u.id = p.user_id
		where p.game_id = ${gameId} order by p.seat`;
	const isMember = players.some(p => p.user_id === user.id);
	if (!isMember && g.status !== 'lobby') throw new GameError('You are not in this game', 403);

	const view: GameView | null = g.state && isMember ? viewFor(g.state, user.id) : null;
	return {
		id: g.id,
		me: user.id,
		status: g.status,
		hostId: g.host_id,
		isMember,
		pin: isMember ? g.pin : null,
		private: !!g.pin,
		timerSec: g.timer_sec,
		version: g.version,
		deadline: g.turn_deadline ? g.turn_deadline.toISOString() : null,
		serverNow: new Date().toISOString(),
		nextGameId: g.next_game_id,
		players: players.map(p => ({ id: p.user_id, seat: p.seat, username: p.username, photo: p.photo, online: p.online })),
		view,
	};
}

export async function leaderboard() {
	return sql<{ id: number; username: string; photo: string; points: number; games: number }[]>`
		with month as (
			select date_trunc('month', now() at time zone 'Africa/Kampala') at time zone 'Africa/Kampala' as start
		)
		select u.id, u.username, u.photo, sum(gp.points)::int as points, count(*)::int as games
		from game_points gp join users u on u.id = gp.user_id, month
		where gp.created_at >= month.start
		group by u.id order by points desc, games asc, u.username
		limit 50`;
}

// ---------- helpers ----------

async function lock(tx: Tx, gameId: number): Promise<GameRow> {
	const [g] = await tx<GameRow[]>`select * from games where id = ${gameId} for update`;
	if (!g) throw new GameError('Game not found', 404);
	return g;
}

async function member(tx: Tx, gameId: number, userId: number) {
	const [m] = await tx`select 1 from game_players where game_id = ${gameId} and user_id = ${userId}`;
	if (!m) throw new GameError('You are not in this game', 403);
}

async function bump(tx: Tx, gameId: number) {
	await tx`update games set version = version + 1 where id = ${gameId}`;
}

/** Persist engine state, turn deadline, per-player progress and (at the end) points. */
async function save(tx: Tx, g: GameRow, state: GameState, newRound: boolean) {
	const finished = !!state.finished;
	const secs = finished || !state.turn || !g.timer_sec ? null : g.timer_sec + (newRound ? ROUND_SUMMARY_SECONDS : 0);
	await tx`
		update games set
			state = ${tx.json(state as never)},
			status = ${finished ? 'finished' : 'playing'},
			round = ${state.round},
			version = version + 1,
			turn_user_id = ${state.turn},
			turn_deadline = ${secs === null ? null : tx`now() + make_interval(secs => ${secs})`},
			finished_at = ${finished ? tx`now()` : null}
		where id = ${g.id}`;
	for (const id of state.order) {
		const p = state.players[String(id)];
		const rank = state.finished?.standings.find(s => s.id === id)?.rank ?? null;
		await tx`update game_players set phase = ${p.phase}, score = ${p.score}, final_rank = ${rank}
			where game_id = ${g.id} and user_id = ${id}`;
	}
	if (state.finished) {
		for (const s of state.finished.standings) {
			await tx`insert into game_points (user_id, game_id, points) values (${s.id}, ${g.id}, ${s.points})
				on conflict (game_id, user_id) do nothing`;
		}
	}
}

async function ping(gameId: number) {
	const [g] = await sql<{ version: number }[]>`select version from games where id = ${gameId}`;
	if (g) await notifyGame(gameId, g.version);
}
