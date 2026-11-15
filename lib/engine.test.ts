import { describe, expect, it } from 'vitest';
import { isRunInOrder, isValidGroup, placeInGroup, meetsCondition, Condition } from './rules';
import { apply, autoPlay, AWAY_TURNS, awayPlayer, countCards, endRound, GameError, GameState, newGame, removePlayer, sameCircle, viewFor } from './engine';
import { penalty } from './cards';

const CLASSIC: Record<string, Condition[]> = {
	'1': [{ type: 'set', count: 3 }, { type: 'set', count: 3 }],
	'2': [{ type: 'set', count: 3 }, { type: 'run', count: 4 }],
	'3': [{ type: 'set', count: 4 }, { type: 'run', count: 4 }],
	'4': [{ type: 'run', count: 7 }],
	'5': [{ type: 'run', count: 8 }],
	'6': [{ type: 'run', count: 9 }],
	'7': [{ type: 'set', count: 4 }, { type: 'set', count: 4 }],
	'8': [{ type: 'color', count: 7 }],
	'9': [{ type: 'set', count: 5 }, { type: 'set', count: 2 }],
	'10': [{ type: 'set', count: 5 }, { type: 'set', count: 3 }],
};

describe('rules', () => {
	it('sets', () => {
		expect(isValidGroup('set', ['1r7', '2b7', '1ww'])).toBe(true);
		expect(isValidGroup('set', ['1r7', '2b8'])).toBe(false);
		expect(isValidGroup('set', ['1r7', '1ss'])).toBe(false);
	});
	it('runs with wilds, both directions, bounded 1..12', () => {
		expect(isRunInOrder(['1r3', '1ww', '2b5', '1g6'])).toBe(true);
		expect(isRunInOrder(['1r9', '1b8', '1ww', '1g6'])).toBe(true);
		expect(isRunInOrder(['1r11', '1b12', '1ww'])).toBe(false); // would need 13
		expect(isRunInOrder(['1ww', '1r1'])).toBe(true);           // 2,1 descending
		expect(isRunInOrder(['1ww', '1ww', '1r1', '1b2'])).toBe(false); // would need -1,0 ascending
		expect(isRunInOrder(['1ww', '1r2'])).toBe(true);
		expect(isRunInOrder(['1r3', '1r5'])).toBe(false);
	});
	it('colour groups', () => {
		expect(isValidGroup('color', ['1r3', '2r9', '1ww'])).toBe(true);
		expect(isValidGroup('color', ['1r3', '2b9'])).toBe(false);
	});
	it('placement at either end of a run', () => {
		expect(placeInGroup('run', ['1r4', '1r5'], '2b3', 'start')).toEqual(['2b3', '1r4', '1r5']);
		expect(placeInGroup('run', ['1r4', '1r5'], '2b3', 'end')).toBeNull();
		expect(placeInGroup('run', ['1r4', '1r5'], '1ss', 'end')).toBeNull();
	});
	it('conditions need the count too', () => {
		expect(meetsCondition({ type: 'set', count: 3 }, ['1r7', '2b7'])).toBe(false);
		expect(meetsCondition({ type: 'set', count: 3 }, ['1r7', '2b7', '1ww'])).toBe(true);
	});
	it('penalties', () => {
		expect([penalty('1r1'), penalty('1r9'), penalty('1r10'), penalty('1ss'), penalty('1ww')]).toEqual([5, 5, 10, 15, 25]);
	});
});

function fixed(state: GameState, id: number, hand: string[]) {
	state.players[String(id)].hand = hand;
}

describe('engine', () => {
	it('deals 10 each, one discard, rest in deck', () => {
		const s = newGame(1, [1, 2, 3], CLASSIC);
		for (const id of [1, 2, 3]) expect(s.players[String(id)].hand.length).toBe(10);
		expect(countCards(s)).toBe(108);
		expect(s.turn).not.toBeNull();
	});

	it('enforces turn order and steps', () => {
		const s = newGame(1, [1, 2], CLASSIC);
		const me = s.turn!, other = s.order.find(i => i !== me)!;
		expect(() => apply(s, other, { type: 'draw', from: 'deck' })).toThrow(GameError);
		expect(() => apply(s, me, { type: 'discard', card: s.players[String(me)].hand[0] })).toThrow(/Draw a card first/);
		apply(s, me, { type: 'draw', from: 'deck' });
		expect(() => apply(s, me, { type: 'draw', from: 'deck' })).toThrow(/already drawn/);
		apply(s, me, { type: 'discard', card: s.players[String(me)].hand.find(c => c[1] !== 's')! });
		expect(s.turn).toBe(other);
		expect(countCards(s)).toBe(108);
	});

	it('refuses a Skip from the discard pile', () => {
		const s = newGame(1, [1, 2], CLASSIC);
		s.discard.unshift('1ss'); s.deck = s.deck.filter(c => c !== '1ss');
		expect(() => apply(s, s.turn!, { type: 'draw', from: 'discard' })).toThrow(/Skip/);
	});

	it('going out by laying down: penalties, phase advance, staged cards count when not laid down', () => {
		const s = newGame(1, [1, 2], CLASSIC);
		const me = s.turn!, other = s.order.find(i => i !== me)!;
		fixed(s, me, ['1r7', '2b7', '1g7', '1r9', '2y9', '1ww']);
		fixed(s, other, ['1b12', '2ww']);
		s.players[String(other)].groups = [['1ss'], []];
		s.deck = s.deck.filter(c => !['1r7', '2b7', '1g7', '1r9', '2y9', '1ww', '1b12', '2ww', '1ss'].includes(c));
		s.step = 'play';
		expect(() => apply(s, me, { type: 'layDown' })).toThrow(/don’t complete/);
		for (const c of ['1r7', '2b7', '1g7']) apply(s, me, { type: 'place', card: c, group: 0 });
		expect(() => apply(s, me, { type: 'place', card: '1r9', group: 0 })).toThrow(/doesn’t fit/);
		for (const c of ['1r9', '2y9', '1ww']) apply(s, me, { type: 'place', card: c, group: 1 });
		const r = apply(s, me, { type: 'layDown' });
		expect(r.roundEnded).toBe(true);
		const res = Object.fromEntries(s.lastRound!.results.map(x => [x.id, x]));
		expect(res[me]).toMatchObject({ completed: true, penalty: 0, phase: 1 });
		expect(res[other]).toMatchObject({ completed: false, penalty: 10 + 25 + 15, phase: 1 });
		expect(s.players[String(me)].phase).toBe(2);
		expect(s.players[String(other)].phase).toBe(1);
		expect(s.round).toBe(2);
		expect(s.players[String(me)].groups.length).toBe(2);
		expect(s.lastRound!.wentOut).toBe(me);
	});

	it('skip: target loses their next turn (2 players: you go again)', () => {
		const s = newGame(1, [1, 2], CLASSIC);
		const me = s.turn!, other = s.order.find(i => i !== me)!;
		fixed(s, me, ['1ss', '1r1', '1r2']);
		s.deck = s.deck.filter(c => c !== '1ss' && c !== '1r1' && c !== '1r2');
		apply(s, me, { type: 'draw', from: 'deck' });
		apply(s, me, { type: 'discard', card: '1ss' });
		expect(s.step).toBe('skip');
		expect(viewFor(s, me).skipTargets).toEqual([other]);
		apply(s, me, { type: 'skip', target: other });
		expect(s.turn).toBe(me);
		expect(s.players[String(other)].skipped).toBe(false);
	});

	it('hidden information: others never see your hand or staged cards', () => {
		const s = newGame(1, [1, 2, 3], CLASSIC);
		const v = viewFor(s, 1);
		expect(v.hand.length).toBe(10);
		for (const p of v.players.filter(p => p.id !== 1)) {
			expect(p.groups).toBeNull();
			expect(p.handCount).toBe(10);
		}
		expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.players['2'].hand));
		expect((v as unknown as Record<string, unknown>).deck).toBeUndefined();
	});

	it('removing a player keeps all 108 cards and passes their turn on', () => {
		const s = newGame(1, [1, 2, 3], CLASSIC);
		const leaving = s.turn!;
		const next = s.order[(s.order.indexOf(leaving) + 1) % 3];
		const lp = s.players[String(leaving)];
		lp.groups[0] = [lp.hand.shift()!]; // one card laid down, still theirs
		expect(removePlayer(s, leaving, 'left the game')).toBe(2);
		expect(s.order).not.toContain(leaving);
		expect(s.turn).toBe(next);
		expect(s.step).toBe('draw');
		expect(countCards(s)).toBe(108);
		expect(s.log[0]).toContain('left the game');
		expect(removePlayer(s, s.order[0], 'was removed')).toBe(1);
		expect(s.turn).toBeNull();
	});

	it('away: timeouts in a row are counted, any own move resets the count, Virtual Friends never count', () => {
		const s = newGame(1, [1, 2, 3], CLASSIC);
		s.bots = [3];
		const first = s.turn!;
		for (let i = 0; i < 3 * AWAY_TURNS; i++) autoPlay(s);
		if (first !== 3) expect(s.missed?.[String(first)]).toBe(AWAY_TURNS);
		expect(s.missed?.['3']).toBeUndefined();
		expect(awayPlayer(s, 3)).toBeNull();
		// person 1 or 2 is away now
		const person = [1, 2].find(x => (s.missed?.[String(x)] || 0) >= AWAY_TURNS)!;
		expect(awayPlayer(s, person)).toBe(person);
		// once they act themselves, the count resets
		while (s.turn !== person) autoPlay(s);
		apply(s, person, { type: 'draw', from: 'deck' });
		expect(s.missed?.[String(person)]).toBeUndefined();
		autoPlay(s); // ran out of time after drawing: counts as one missed turn
		expect(s.missed?.[String(person)]).toBe(1);
		removePlayer(s, person, 'was taken out');
		expect(s.missed?.[String(person)]).toBeUndefined();
		expect(countCards(s)).toBe(108);
	});

	it('finished game: a player who moved up a phase still gets groups matching their conditions (live game 1013)', () => {
		const s = newGame(1, [1, 2], CLASSIC);
		// player 2 completed phase 6 (one run) in the last round and moved up to phase 7 (two sets)
		const p = s.players['2'];
		p.phase = 7; p.done = true; p.groups = [['1r1', '1b2', '1g3', '1y4', '2r5', '2b6', '2g7', '2y8', '1r9']];
		s.finished = { standings: [] };
		for (const me of [1, 2]) {
			const v = viewFor(s, me).players.find(x => x.id === 2)!;
			expect(v.groups!.length).toBe(v.conditions.length);
			expect(v.conditions).toEqual(CLASSIC['6']);
		}
	});

		it('timeout auto-plays a legal turn', () => {
		const s = newGame(1, [1, 2, 3], CLASSIC);
		const before = s.turn;
		autoPlay(s);
		expect(s.turn).not.toBe(before);
		expect(countCards(s)).toBe(108);
	});
});

// ---------- Bots play full games to the end ----------
function botTurn(s: GameState) {
	const me = s.turn!;
	const p = s.players[String(me)];
	const tryApply = (a: Parameters<typeof apply>[2]) => { try { return apply(s, me, a); } catch (e) { if (!(e instanceof GameError)) throw e; return null; } };
	const num = (c: string) => parseInt(c.slice(2), 10);
	const top = s.discard[0];
	const useful = top && top[1] !== 's' && Math.random() < 0.25 && (top[1] === 'w' || p.hand.filter(c => num(c) === num(top)).length >= 2);
	if (s.step === 'draw') apply(s, me, { type: 'draw', from: useful ? 'discard' : 'deck' });
	if (s.step !== 'play') { if (s.step === 'skip') apply(s, me, { type: 'skip', target: s.order.find(i => i !== me && !s.players[String(i)].skipped)! }); return; }
	if (!p.done) {
		// try to build each group greedily, lay down if complete, otherwise take back
		for (let g = 0; g < p.groups.length; g++) {
			let changed = true;
			while (changed) {
				changed = false;
				for (const c of [...p.hand]) for (const end of ['end', 'start'] as const) {
					if (tryApply({ type: 'place', card: c, group: g, end })) { changed = true; break; }
				}
			}
		}
		const r = tryApply({ type: 'layDown' });
		if (r?.roundEnded) return;
		if (!p.done) apply(s, me, { type: 'unstage' });
	} else {
		for (const t of s.order) for (const c of [...p.hand]) {
			const target = s.players[String(t)];
			if (!target.done) continue;
			for (let g = 0; g < target.groups.length; g++) {
				let r = null;
				for (const end of ['end', 'start'] as const) {
					r = t === me ? tryApply({ type: 'place', card: c, group: g, end }) : tryApply({ type: 'hit', target: t, group: g, card: c, end });
					if (r) break;
				}
				if (r?.roundEnded) return;
				if (r) break;
			}
		}
	}
	if (s.turn !== me || s.step !== 'play' || s.finished) return;
	// discard the least useful plain card: fewest same numbers, then fewest neighbours, then highest value
	const plain = p.hand.filter(c => c[1] !== 'w');
	const pool = plain.length ? plain : p.hand;
	const score = (c: string) => c[1] === 's' ? -1 : p.hand.filter(x => num(x) === num(c)).length * 3 + p.hand.filter(x => Math.abs(num(x) - num(c)) === 1).length;
	const card = pool.reduce((a, b) => (score(b) < score(a) ? b : a));
	const r = apply(s, me, { type: 'discard', card });
	if (!r.roundEnded && (s.step as string) === 'skip') apply(s, me, { type: 'skip', target: s.order.find(i => i !== me && !s.players[String(i)].skipped)! });
}

// Easy targets so bots reach the end quickly; still exercises set, run and colour groups
const EASY: Record<string, Condition[]> = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1),
	i % 3 === 0 ? [{ type: 'set', count: 2 }] : i % 3 === 1 ? [{ type: 'run', count: 3 }] : [{ type: 'color', count: 3 }]]));

describe('full games (bots)', () => {
	for (const n of [2, 3, 4, 6]) {
		it(`${n} players play to the finish with all 108 cards accounted for`, { timeout: 60000 }, () => {
			const s = newGame(1, Array.from({ length: n }, (_, i) => i + 1), EASY);
			let moves = 0;
			while (!s.finished && moves < 100000) {
				if (Math.random() < 0.02) autoPlay(s); else botTurn(s);
				expect(countCards(s)).toBe(108);
				moves++;
			}
			if (!s.finished && process.env.DIAG) console.log('DIAG', n, 'moves', moves, 'round', s.round, 'phases', s.order.map(i => s.players[String(i)].phase + (s.players[String(i)].done ? 'D' : '') + '/' + JSON.stringify(s.players[String(i)].groups) + '/' + s.players[String(i)].hand.join(' ')), 'step', s.step, 'turn', s.turn, 'log', s.log.slice(0, 4));
			expect(s.finished).not.toBeNull();
			const st = s.finished!.standings;
			expect(st.length).toBe(n);
			expect(st[0].points).toBe(n);
			expect(st.at(-1)!.points).toBe(1);
			expect(st[0].phase).toBe(10);
			for (let i = 1; i < st.length; i++) {
				expect(st[i - 1].phase > st[i].phase || (st[i - 1].phase === st[i].phase && st[i - 1].score <= st[i].score)).toBe(true);
			}
		});
	}
	it('classic rules: 20,000 bot moves keep every card accounted for', { timeout: 60000 }, () => {
		const s = newGame(1, [1, 2, 3, 4], CLASSIC);
		for (let moves = 0; moves < 20000 && !s.finished; moves++) {
			if (Math.random() < 0.02) autoPlay(s); else botTurn(s);
			expect(countCards(s)).toBe(108);
		}
	});
});

describe('Order Shuffle (admin switch)', () => {
	it('off: the playing order stays the same every round', () => {
		const s = newGame(1, [1, 2, 3, 4], CLASSIC);
		const first = [...s.order];
		for (let r = 0; r < 5; r++) endRound(s, null);
		expect(s.order).toEqual(first);
		expect(viewFor(s, 1).orderShuffled).toBe(false);
	});
	for (const n of [3, 4, 6]) {
		it(`on, ${n} players: every new round has a different circle, all cards accounted for`, () => {
			const s = newGame(1, Array.from({ length: n }, (_, i) => i + 1), CLASSIC);
			s.shuffleOrder = true;
			for (let r = 0; r < 8; r++) {
				const before = [...s.order];
				endRound(s, null);
				expect(sameCircle(before, s.order), `round ${s.round}: ${before} -> ${s.order}`).toBe(false);
				expect([...s.order].sort()).toEqual([...before].sort());
				expect(countCards(s)).toBe(108);
				expect(viewFor(s, 1).orderShuffled).toBe(true);
				expect(s.order).toContain(s.turn);
			}
		});
	}
	it('2 players: nothing to shuffle', () => {
		const s = newGame(1, [1, 2], CLASSIC);
		s.shuffleOrder = true;
		endRound(s, null);
		expect(viewFor(s, 1).orderShuffled).toBe(false);
	});
	it('sameCircle treats rotations as the same order', () => {
		expect(sameCircle([1, 2, 3], [2, 3, 1])).toBe(true);
		expect(sameCircle([1, 2, 3], [1, 3, 2])).toBe(false);
	});
	it('bots finish a full game with Order Shuffle on', { timeout: 60000 }, () => {
		const s = newGame(1, [1, 2, 3, 4], EASY);
		s.shuffleOrder = true;
		let t = 0;
		while (!s.finished && t < 20000) { botTurn(s); expect(countCards(s)).toBe(108); t++; }
		expect(s.finished).not.toBeNull();
	});
});
