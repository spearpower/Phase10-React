import { describe, expect, it } from 'vitest';
import { botTurn, planPhase, missing } from './bot';
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
