// Meld rules. The same functions validate a single placement (partial group)
// and a full group when a phase is laid down. Wilds stand in for any card;
// a Skip can never be part of a group.
import { Card, isSkip, isWild, colourOf, numberOf } from './card-codes';

export type ConditionType = 'set' | 'run' | 'color' | 'runcolor';
export interface Condition { type: ConditionType; count: number }

export function conditionLabel(c: Condition): string {
	switch (c.type) {
		case 'set': return `Set of ${c.count}`;
		case 'run': return `Run of ${c.count}`;
		case 'color': return `${c.count} of one colour`;
		case 'runcolor': return `Colour run of ${c.count}`;
	}
}

function sameNumber(cards: Card[]): boolean {
	const n = cards.filter(c => !isWild(c)).map(numberOf);
	return n.every(x => x === n[0]);
}

function sameColour(cards: Card[]): boolean {
	const c = cards.filter(x => !isWild(x)).map(colourOf);
	return c.every(x => x === c[0]);
}

/** Cards in the given order form a run of consecutive numbers within 1..12 (ascending or descending). */
export function isRunInOrder(cards: Card[]): boolean {
	const idx = cards.findIndex(c => !isWild(c));
	if (idx === -1) return cards.length <= 12; // only wilds so far
	for (const dir of [1, -1]) {
		const start = numberOf(cards[idx]) - dir * idx;
		let ok = true;
		for (let i = 0; i < cards.length; i++) {
			const expected = start + dir * i;
			if (expected < 1 || expected > 12) { ok = false; break; }
			if (!isWild(cards[i]) && numberOf(cards[i]) !== expected) { ok = false; break; }
		}
		if (ok) return true;
	}
	return false;
}

/** Is this (possibly partial) group valid for the condition type? */
export function isValidGroup(type: ConditionType, cards: Card[]): boolean {
	if (cards.some(isSkip)) return false;
	switch (type) {
		case 'set': return sameNumber(cards);
		case 'color': return sameColour(cards);
		case 'run': return isRunInOrder(cards);
		case 'runcolor': return isRunInOrder(cards) && sameColour(cards);
	}
}

export type End = 'start' | 'end';

/** Result of adding `card` to `group` at one end, or null if illegal. */
export function placeInGroup(type: ConditionType, group: Card[], card: Card, end: End): Card[] | null {
	if (isSkip(card)) return null;
	const next = end === 'start' ? [card, ...group] : [...group, card];
	return isValidGroup(type, next) ? next : null;
}

/** A full group satisfies its condition. */
export function meetsCondition(cond: Condition, group: Card[]): boolean {
	return group.length >= cond.count && isValidGroup(cond.type, group);
}
