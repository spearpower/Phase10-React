// Server-side card utilities (uses Node's crypto RNG). Pure helpers live in card-codes.ts.
import { randomInt } from 'crypto';
import { COLOURS, type Card } from './card-codes';

export * from './card-codes';

export function newDeck(): Card[] {
	const cards: Card[] = [];
	for (const copy of [1, 2]) for (const col of COLOURS) for (let n = 1; n <= 12; n++) cards.push(`${copy}${col}${n}`);
	for (let k = 1; k <= 4; k++) cards.push(`${k}ss`);
	for (let k = 1; k <= 8; k++) cards.push(`${k}ww`);
	return shuffle(cards);
}

/** Fisher–Yates with a cryptographic RNG. */
export function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export const pick = <T>(arr: T[]): T => arr[randomInt(arr.length)];
