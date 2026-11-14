import { describe, expect, it } from 'vitest';
import { botTurn, planPhase, missing } from './bot';
import { hintFor } from './plan';
import { countCards, newGame } from './engine';
import { Condition, meetsCondition } from './rules';

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

describe('planning', () => {
	it('finds two sets using a wild', () => {
		const plan = planPhase(['1r7', '2b7', '1g7', '1g9', '2y9', '1ww', '1r2'], CLASSIC['1']);
		expect(plan).not.toBeNull();
		plan!.forEach((g, i) => expect(meetsCondition(CLASSIC['1'][i], g)).toBe(true));
	});
	it('finds a set + an ordered run', () => {
		const plan = planPhase(['1r4', '2b4', '1g4', '1y5', '2r6', '1ww', '1b8', '1g1'], CLASSIC['2']);
		expect(plan).not.toBeNull();
		expect(meetsCondition(CLASSIC['2'][1], plan![1])).toBe(true);
	});
	it('returns null when impossible, and counts what is missing', () => {
		expect(planPhase(['1r1', '1b2', '1g3'], CLASSIC['1'])).toBeNull();
		expect(missing(['1r7', '2b7', '1g9'], CLASSIC['1'])).toBe(3);
		expect(missing(['1r7', '2b7', '1g7', '1r9', '2y9', '1ww'], CLASSIC['1'])).toBe(0);
	});
});

describe('Virtual Friends play complete classic games', () => {
	for (const n of [2, 3, 4, 6]) {
		it(`${n} Virtual Friends finish a 10-phase game`, { timeout: 60000 }, () => {
			const ids = Array.from({ length: n }, (_, i) => i + 1);
			const s = newGame(1, ids, CLASSIC);
			let turns = 0;
			while (!s.finished && turns < 20000) {
				botTurn(s, s.turn!);
				expect(countCards(s)).toBe(108);
				turns++;
			}
			expect(s.finished).not.toBeNull();
			expect(s.finished!.standings[0].phase).toBe(10);
			console.log(`${n} friends: ${s.round} rounds, ${turns} turns`);
		});
	}
});

describe('Virtual Friend levels', () => {
	for (const level of ['easy', 'normal', 'smart'] as const) {
		it(`${level}: 4 Virtual Friends finish a classic game with all cards accounted for`, { timeout: 60000 }, () => {
			const s = newGame(1, [1, 2, 3, 4], CLASSIC);
			s.botLevel = level;
			let turns = 0;
			while (!s.finished && turns < 40000) { botTurn(s, s.turn!); expect(countCards(s)).toBe(108); turns++; }
			expect(s.finished).not.toBeNull();
			console.log(`${level}: ${s.round} rounds, ${turns} turns`);
		});
	}
	it('smart beats easy more often than not', { timeout: 120000 }, () => {
		let smartWins = 0;
		const N = 16;
		for (let k = 0; k < N; k++) {
			const s = newGame(1, [1, 2], CLASSIC);
			// players 1 = smart, 2 = easy: switch the level each turn
			let turns = 0;
			while (!s.finished && turns < 40000) { s.botLevel = s.turn === 1 ? 'smart' : 'easy'; botTurn(s, s.turn!); turns++; }
			if (s.finished!.standings[0].id === 1) smartWins++;
		}
		console.log(`smart won ${smartWins}/${N} against easy`);
		expect(smartWins).toBeGreaterThan(N / 2);
	});
});

describe('Hint button', () => {
	const base = { staged: [[], []] as string[][], done: false, conds: CLASSIC['1'], phase: 1, top: null, tables: [] };
	it('spots a complete phase and offers to arrange it', () => {
		const h = hintFor({ ...base, step: 'play', hand: ['1r7', '2b7', '1g7', '1g9', '2y9', '1ww', '1r2', '1b11'] });
		expect(h.arrange).toBeTruthy();
		h.arrange!.forEach((g, i) => expect(meetsCondition(CLASSIC['1'][i], g)).toBe(true));
		expect(['1r2', '1b11']).toContain(h.discard);
	});
	it('counts staged cards too', () => {
		const h = hintFor({ ...base, step: 'play', hand: ['1g9', '2y9', '1ww', '1r2'], staged: [['1r7', '2b7', '1g7'], []] });
		expect(h.arrange).toBeTruthy();
	});
	it('says how many cards are missing and never suggests throwing a kept card', () => {
		const h = hintFor({ ...base, step: 'play', hand: ['1r7', '2b7', '1g9', '1r2', '1b11', '2g4'] });
		expect(h.arrange).toBeUndefined();
		expect(h.keep).toEqual(expect.arrayContaining(['1r7', '2b7']));
		expect(h.keep).not.toContain(h.discard);
		expect(h.message).toMatch(/about \d more/i);
	});
	it('draw step: take a discard that helps, otherwise the deck', () => {
		expect(hintFor({ ...base, step: 'draw', hand: ['1r7', '2b7', '1g9'], top: '1y7' }).pile).toBe('discard');
		expect(hintFor({ ...base, step: 'draw', hand: ['1r7', '2b7', '1g9'], top: '1y3' }).pile).toBe('deck');
		expect(hintFor({ ...base, step: 'draw', hand: ['1r7'], top: '1ss' }).pile).toBe('deck');
	});
	it('after laying down: shows cards that fit on the table', () => {
		const h = hintFor({ ...base, step: 'play', done: true, hand: ['1y7', '1r12'], tables: [{ conds: CLASSIC['1'], groups: [['1r7', '2b7', '1g7'], ['1g9', '2y9', '1ww']] }] });
		expect(h.keep).toEqual(['1y7']);
		expect(h.discard).toBe('1r12');
	});
});

describe('no endless rounds', () => {
	it('120 two-player games at every level finish (no discard-pile ping-pong)', { timeout: 180000 }, () => {
		const levels = ['easy', 'normal', 'smart'] as const;
		for (let k = 0; k < 120; k++) {
			const s = newGame(1, [1, 2], CLASSIC);
			s.botLevel = levels[k % 3];
			let t = 0;
			while (!s.finished && t < 20000) { botTurn(s, s.turn!); t++; }
			expect(s.finished, `game ${k} (${s.botLevel}) stuck in round ${s.round}`).not.toBeNull();
		}
	});
});
