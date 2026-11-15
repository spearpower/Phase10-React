// Pure game engine: takes a state + an action, returns the new state or throws a GameError.
// No I/O here, so it is unit-tested directly (lib/engine.test.ts).
import { Card, newDeck, penalty, isSkip, isWild, pick, shuffle } from './cards';
import { Condition, End, meetsCondition, placeInGroup } from './rules';

export class GameError extends Error {
	constructor(message: string, public status = 400) { super(message); }
}

export type Step = 'draw' | 'play' | 'skip';
export type BotLevel = 'easy' | 'normal' | 'smart';

/** A person whose turn times out this many times in a row is taken out of the game. */
export const AWAY_TURNS = 3;

export interface PlayerState {
	id: number;
	hand: Card[];
	groups: Card[][];   // one per phase condition; staged until `done`
	phase: number;      // 1..10
	done: boolean;      // phase laid down this round
	skipped: boolean;   // will lose their next turn
	score: number;      // penalty points so far (lower is better)
}

export interface RoundResult { id: number; phase: number; completed: boolean; penalty: number; score: number }

export interface Standing { id: number; phase: number; score: number; rank: number; points: number }

export interface GameState {
	edition: number;
	round: number;
	order: number[];                       // seating / turn order (user ids)
	deck: Card[];
	discard: Card[];                       // index 0 = top
	players: Record<string, PlayerState>;
	turn: number | null;
	step: Step;
	phases: Record<string, Condition[]>;   // phase_no -> conditions for this edition
	maxPhase: number;
	lastRound: { round: number; results: RoundResult[]; wentOut?: number | null } | null;
	finished: { standings: Standing[] } | null;
	log: string[];                         // short recent events, newest first
	reshuffles?: number;                   // deck refills this round (stalemate guard)
	bots?: number[];                       // Virtual Friends at this table (played by lib/bot.ts)
	botLevel?: BotLevel;                   // how well the Virtual Friends play (default normal)
	missed?: Record<string, number>;       // turns in a row each person ran out of time
	shuffleOrder?: boolean;                // admin "Order Shuffle": new seating order every round
	orderShuffledRound?: number;           // the round whose order was just shuffled (for the round summary)
}

export type Action =
	| { type: 'draw'; from: 'deck' | 'discard' }
	| { type: 'place'; card: Card; group: number; end?: End }
	| { type: 'unstage' }
	| { type: 'layDown' }
	| { type: 'hit'; target: number; group: number; card: Card; end?: End }
	| { type: 'discard'; card: Card }
	| { type: 'skip'; target: number }
	| { type: 'timeout' };

const P = (s: GameState, id: number) => {
	const p = s.players[String(id)];
	if (!p) throw new GameError('You are not in this game', 403);
	return p;
};
const conditionsFor = (s: GameState, p: PlayerState) => s.phases[String(p.phase)] || [];
const takeFromHand = (p: PlayerState, card: Card) => {
	const i = p.hand.indexOf(card);
	if (i === -1) throw new GameError('That card is not in your hand');
	p.hand.splice(i, 1);
};
const log = (s: GameState, msg: string) => { s.log.unshift(msg); s.log.length = Math.min(s.log.length, 6); };

/** Names are resolved by the caller (DB); the log stores ids as {id} placeholders. */
const who = (id: number) => `{${id}}`;

// ---------- Setup ----------

export function newGame(edition: number, playerIds: number[], phases: Record<string, Condition[]>): GameState {
	const order = shuffle([...playerIds]);
	const players: Record<string, PlayerState> = {};
	for (const id of order) players[String(id)] = { id, hand: [], groups: [], phase: 1, done: false, skipped: false, score: 0 };
	const s: GameState = {
		edition, round: 0, order, deck: [], discard: [], players, turn: null, step: 'draw',
		phases, maxPhase: Math.max(...Object.keys(phases).map(Number)), lastRound: null, finished: null, log: [],
	};
	dealRound(s);
	return s;
}

/** Same playing order? Orders are circles: [A,B,C] and [B,C,A] are the same order. */
export function sameCircle(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	const i = b.indexOf(a[0]);
	return i >= 0 && a.every((x, k) => x === b[(i + k) % b.length]);
}

/** A new seating order in which players sit next to different people (3+ players). */
export function newCircle(order: number[]): number[] {
	let next = shuffle([...order]);
	for (let tries = 0; tries < 12 && sameCircle(order, next); tries++) next = shuffle([...order]);
	return next;
}

export function dealRound(s: GameState): void {
	if (s.shuffleOrder && s.round > 0 && s.order.length >= 3) {
		s.order = newCircle(s.order);
		s.orderShuffledRound = s.round + 1;
	}
	s.round += 1;
	s.reshuffles = 0;
	const deck = newDeck();
	for (const id of s.order) {
		const p = s.players[String(id)];
		p.hand = []; p.done = false; p.skipped = false;
		p.groups = conditionsFor(s, p).map(() => []);
	}
	for (let k = 0; k < 10; k++) for (const id of s.order) s.players[String(id)].hand.push(deck.shift()!);
	s.discard = [deck.shift()!];
	s.deck = deck;
	const first = pick(s.order);
	if (isSkip(s.discard[0])) s.players[String(first)].skipped = true; // a Skip face-up skips the first player
	beginTurn(s, first);
	log(s, `Round ${s.round} dealt`);
}

/** Give the turn to `id`, passing over anyone who was skipped. */
function beginTurn(s: GameState, id: number): void {
	let next = id;
	for (let guard = 0; guard < s.order.length; guard++) {
		const p = s.players[String(next)];
		if (!p.skipped) break;
		p.skipped = false;
		log(s, `${who(next)} was skipped`);
		next = nextAfter(s, next);
	}
	s.turn = next;
	s.step = 'draw';
}

const nextAfter = (s: GameState, id: number) => s.order[(s.order.indexOf(id) + 1) % s.order.length];

function passTurn(s: GameState, from: number): void {
	beginTurn(s, nextAfter(s, from));
}

function refillDeck(s: GameState): void {
	if (s.deck.length > 0) return;
	const [top, ...rest] = s.discard;
	if (rest.length === 0) throw new GameError('No cards left to draw');
	s.deck = shuffle(rest);
	s.discard = [top];
	s.reshuffles = (s.reshuffles || 0) + 1;
	log(s, 'Discard pile reshuffled into the deck');
}

// ---------- Actions ----------

/** Applies one action for `me`. Mutates and returns `s`. Returns `roundEnded` when the round (or game) finished. */
export function apply(s: GameState, me: number, a: Action): { roundEnded: boolean } {
	if (s.finished) throw new GameError('This game has finished');
	const p = P(s, me);
	if (s.missed?.[String(me)]) delete s.missed[String(me)]; // they're here: reset the away count
	const myTurn = s.turn === me;
	const needTurn = (step?: Step) => {
		if (!myTurn) throw new GameError('It is not your turn');
		if (step && s.step !== step) {
			throw new GameError(step === 'draw' ? 'You have already drawn this turn' : step === 'play' ? 'Draw a card first' : 'Choose a player to skip first');
		}
	};

	switch (a.type) {
		case 'draw': {
			needTurn('draw');
			if (a.from === 'discard') {
				const top = s.discard[0];
				if (!top) throw new GameError('The discard pile is empty');
				if (isSkip(top)) throw new GameError('A Skip can’t be taken from the discard pile');
				p.hand.push(s.discard.shift()!);
				log(s, `${who(me)} took from the discard pile`);
			} else {
				refillDeck(s);
				// Stalemate: everyone has laid down and the deck went round 3 times with nobody going out
				if ((s.reshuffles || 0) >= 3 && s.order.every(id => s.players[String(id)].done)) {
					log(s, 'No one could go out — round ends');
					return { roundEnded: endRound(s, null) };
				}
				p.hand.push(s.deck.shift()!);
				log(s, `${who(me)} drew from the deck`);
			}
			s.step = 'play';
			return { roundEnded: false };
		}

		case 'place': {
			const conds = conditionsFor(s, p);
			const cond = conds[a.group];
			if (!cond) throw new GameError('No such group');
			if (p.done) needTurn('play'); // after laying down, adding to your own groups is a normal play
			if (!p.hand.includes(a.card)) throw new GameError('That card is not in your hand');
			const next = placeInGroup(cond.type, p.groups[a.group], a.card, a.end || 'end');
			if (!next) throw new GameError('That card doesn’t fit there');
			takeFromHand(p, a.card);
			p.groups[a.group] = next;
			if (p.done && p.hand.length === 0) return { roundEnded: endRound(s, me) };
			return { roundEnded: false };
		}

		case 'unstage': {
			if (p.done) throw new GameError('Your phase is already laid down');
			for (const g of p.groups) p.hand.push(...g);
			p.groups = p.groups.map(() => []);
			return { roundEnded: false };
		}

		case 'layDown': {
			needTurn('play');
			if (p.done) throw new GameError('Your phase is already laid down');
			const conds = conditionsFor(s, p);
			conds.forEach((c, i) => {
				if (!meetsCondition(c, p.groups[i] || [])) throw new GameError('Your groups don’t complete the phase yet');
			});
			p.done = true;
			log(s, `${who(me)} completed phase ${p.phase}`);
			if (p.hand.length === 0) return { roundEnded: endRound(s, me) };
			return { roundEnded: false };
		}

		case 'hit': {
			needTurn('play');
			if (!p.done) throw new GameError('Lay down your own phase first');
			const t = P(s, a.target);
			if (!t.done) throw new GameError('That player hasn’t laid down yet');
			const cond = conditionsFor(s, t)[a.group];
			if (!cond) throw new GameError('No such group');
			if (!p.hand.includes(a.card)) throw new GameError('That card is not in your hand');
			const next = placeInGroup(cond.type, t.groups[a.group], a.card, a.end || 'end');
			if (!next) throw new GameError('That card doesn’t fit there');
			takeFromHand(p, a.card);
			t.groups[a.group] = next;
			if (p.hand.length === 0) return { roundEnded: endRound(s, me) };
			return { roundEnded: false };
		}

		case 'discard': {
			needTurn('play');
			takeFromHand(p, a.card);
			s.discard.unshift(a.card);
			if (p.hand.length === 0) {
				log(s, `${who(me)} went out`);
				return { roundEnded: endRound(s, me) };
			}
			if (isSkip(a.card) && skipTargets(s, me).length > 0) {
				s.step = 'skip';
				return { roundEnded: false };
			}
			passTurn(s, me);
			return { roundEnded: false };
		}

		case 'skip': {
			needTurn('skip');
			if (!skipTargets(s, me).includes(a.target)) throw new GameError('You can’t skip that player');
			P(s, a.target).skipped = true;
			log(s, `${who(me)} skipped ${who(a.target)}`);
			passTurn(s, me);
			return { roundEnded: false };
		}

		case 'timeout':
			throw new GameError('Use autoPlay for timeouts');
	}
}

/**
 * Take a player out of a game in progress (they left, or the host / a super admin removed them).
 * Their cards (hand and any laid-down groups) are shuffled back into the deck, so all 108 stay in play.
 * If it was their turn, play moves to the next player. Returns how many players are left.
 */
export function removePlayer(s: GameState, id: number, note: string): number {
	const p = s.players[String(id)];
	if (!p) throw new GameError('That player is not in this game', 404);
	const next = s.order.length > 1 ? nextAfter(s, id) : null;
	s.deck = shuffle([...s.deck, ...p.hand, ...p.groups.flat()]);
	delete s.players[String(id)];
	s.order = s.order.filter(x => x !== id);
	if (s.bots) s.bots = s.bots.filter(x => x !== id);
	if (s.missed) delete s.missed[String(id)];
	log(s, `${who(id)} ${note}`);
	if (s.order.length >= 2 && s.turn === id && next !== null) beginTurn(s, next);
	if (s.order.length < 2) s.turn = null;
	return s.order.length;
}

export function skipTargets(s: GameState, me: number): number[] {
	return s.order.filter(id => id !== me && !s.players[String(id)].skipped);
}

/** Plays the minimum legal turn for whoever's turn it is (turn timer ran out). */
export function autoPlay(s: GameState): { roundEnded: boolean } {
	if (s.finished || s.turn === null) return { roundEnded: false };
	const id = s.turn;
	const p = s.players[String(id)];
	const person = !s.bots?.includes(id);
	const missedBefore = s.missed?.[String(id)] || 0;
	const r = autoPlayTurn(s, id, p);
	if (person && s.players[String(id)] && !s.finished) s.missed = { ...(s.missed || {}), [String(id)]: missedBefore + 1 };
	return r;
}

/** The person this many turns away (or more) should be taken out. */
export function awayPlayer(s: GameState, id: number | null): number | null {
	if (id === null || s.finished || !s.players[String(id)] || s.bots?.includes(id)) return null;
	return (s.missed?.[String(id)] || 0) >= AWAY_TURNS ? id : null;
}

function autoPlayTurn(s: GameState, id: number, p: PlayerState): { roundEnded: boolean } {
	if (!p.done && p.groups.some(g => g.length)) apply(s, id, { type: 'unstage' });
	if (s.step === 'draw') apply(s, id, { type: 'draw', from: 'deck' });
	if (s.step === 'play') {
		// Throw away the most expensive plain card; keep wilds and skips if possible
		const plain = p.hand.filter(c => !isWild(c) && !isSkip(c));
		const pool = plain.length ? plain : p.hand;
		const card = pool.reduce((a, b) => (penalty(b) > penalty(a) ? b : a));
		takeFromHand(p, card);
		s.discard.unshift(card);
		log(s, `${who(id)} ran out of time`);
		if (p.hand.length === 0) return { roundEnded: endRound(s, id) };
		passTurn(s, id);
		return { roundEnded: false };
	}
	if (s.step === 'skip') {
		log(s, `${who(id)} ran out of time`);
		passTurn(s, id);
	}
	return { roundEnded: false };
}

// ---------- Round end ----------

/** Scores the round, advances phases, then deals the next round or finishes the game. Returns true. */
export function endRound(s: GameState, wentOut: number | null = null): boolean {
	const results: RoundResult[] = [];
	let someoneFinished = false;
	for (const id of s.order) {
		const p = s.players[String(id)];
		const left = p.done ? p.hand : [...p.hand, ...p.groups.flat()];
		const pen = left.reduce((sum, c) => sum + penalty(c), 0);
		p.score += pen;
		results.push({ id, phase: p.phase, completed: p.done, penalty: pen, score: p.score });
		if (p.done && p.phase >= s.maxPhase) someoneFinished = true;
		if (p.done && p.phase < s.maxPhase) p.phase += 1;
	}
	s.lastRound = { round: s.round, results, wentOut };

	if (someoneFinished) {
		// Phase reached (desc), then fewest penalty points
		const ranked = [...s.order].map(id => s.players[String(id)]).map(p => ({
			id: p.id, phase: p.done && p.phase >= s.maxPhase ? s.maxPhase + 1 : p.phase, score: p.score,
		})).sort((a, b) => b.phase - a.phase || a.score - b.score);
		const n = ranked.length;
		s.finished = {
			standings: ranked.map((r, i) => ({ id: r.id, phase: Math.min(r.phase, s.maxPhase), score: r.score, rank: i + 1, points: n - i })),
		};
		s.turn = null;
		log(s, 'Game over');
		return true;
	}
	dealRound(s);
	return true;
}

// ---------- What one player is allowed to see ----------

export interface PlayerView {
	id: number; phase: number; done: boolean; skipped: boolean; score: number;
	handCount: number;
	groups: Card[][] | null;          // visible only once laid down (or to the owner)
	conditions: Condition[];
}

export interface GameView {
	round: number; turn: number | null; step: Step; myId: number;
	hand: Card[];
	players: PlayerView[];
	order: number[];
	deckCount: number;
	discard: Card[];                  // top few
	skipTargets: number[];
	lastRound: GameState['lastRound'];
	finished: GameState['finished'];
	orderShuffled: boolean;            // this round was dealt with a new playing order
	log: string[];
	maxPhase: number;
}

/** How many discards players can see when they spread the pile (they all saw them being thrown). */
export const PEEK_CARDS = 8;

export function viewFor(s: GameState, me: number): GameView {
	const mine = s.players[String(me)];
	return {
		round: s.round, turn: s.turn, step: s.step, myId: me,
		hand: mine ? [...mine.hand] : [],
		order: s.order,
		players: s.order.map(id => {
			const p = s.players[String(id)];
			// At the end of the game a player who laid down has already moved up a phase, but their
			// groups still belong to the phase they completed: show those groups under that phase.
			let conditions = conditionsFor(s, p);
			if (p.done && p.groups.length !== conditions.length && (s.phases[String(p.phase - 1)] || []).length === p.groups.length) {
				conditions = s.phases[String(p.phase - 1)];
			}
			const groups = conditions.map((_, i) => p.groups[i] || []);
			return {
				id, phase: p.phase, done: p.done, skipped: p.skipped, score: p.score,
				handCount: p.hand.length + (id !== me && !p.done ? p.groups.flat().length : 0),
				groups: id === me || p.done ? groups : null,
				conditions,
			};
		}),
		deckCount: s.deck.length,
		discard: s.discard.slice(0, PEEK_CARDS),   // top first; tapping the pile spreads these
		skipTargets: s.turn === me && s.step === 'skip' ? skipTargets(s, me) : [],
		lastRound: s.lastRound,
		finished: s.finished,
		orderShuffled: s.orderShuffledRound === s.round,
		log: s.log,
		maxPhase: s.maxPhase,
	};
}

/** Every card is somewhere exactly once (108 total). Used by tests and as a server-side sanity check. */
export function countCards(s: GameState): number {
	let n = s.deck.length + s.discard.length;
	for (const id of s.order) {
		const p = s.players[String(id)];
		n += p.hand.length + p.groups.flat().length;
	}
	return n;
}
