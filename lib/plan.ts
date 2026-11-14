// Phase planning and card judgement. Pure (no Node imports), so it runs on the server for
// Virtual Friends (lib/bot.ts) and in the browser for the Hint button.
import { Card, cardLabel, colourOf, isSkip, isWild, numberOf, penalty } from './card-codes';
import { Condition, placeInGroup } from './rules';

type Group = Card[];

/** Candidate groups of exactly cond.count cards from `cards`, fewest wilds first. Runs come out in order. */
function candidates(cond: Condition, cards: Card[]): Group[] {
	const wilds = cards.filter(isWild);
	const plain = cards.filter(c => !isWild(c) && !isSkip(c));
	const out: { g: Group; w: number }[] = [];
	const n = cond.count;

	if (cond.type === 'set' || cond.type === 'color') {
		const key = cond.type === 'set' ? (c: Card) => String(numberOf(c)) : colourOf;
		const buckets = new Map<string, Card[]>();
		for (const c of plain) buckets.set(key(c), [...(buckets.get(key(c)) || []), c]);
		for (const nat of buckets.values()) {
			const sorted = [...nat].sort((a, b) => penalty(b) - penalty(a)); // spend expensive cards first
			const use = sorted.slice(0, n);
			const need = n - use.length;
			if (need <= wilds.length) out.push({ g: [...use, ...wilds.slice(0, need)], w: need });
		}
		if (wilds.length >= n) out.push({ g: wilds.slice(0, n), w: n });
	} else {
		const sameColour = cond.type === 'runcolor';
		const colours = sameColour ? ['r', 'b', 'y', 'g'] : [''];
		for (const col of colours) {
			const pool = sameColour ? plain.filter(c => colourOf(c) === col) : plain;
			for (let start = 1; start + n - 1 <= 12; start++) {
				const g: Group = []; let w = 0; const used = new Set<Card>();
				for (let k = 0; k < n; k++) {
					const nat = pool.find(c => numberOf(c) === start + k && !used.has(c));
					if (nat) { g.push(nat); used.add(nat); } else { g.push('?'); w++; }
				}
				if (w <= wilds.length && w < n) {
					let wi = 0;
					out.push({ g: g.map(c => (c === '?' ? wilds[wi++] : c)), w });
				}
			}
		}
	}
	return out.sort((a, b) => a.w - b.w).slice(0, 14).map(x => x.g);
}

export const without = (cards: Card[], used: Card[]) => {
	const rest = [...cards];
	for (const u of used) { const i = rest.indexOf(u); if (i >= 0) rest.splice(i, 1); }
	return rest;
};

/** An exact way to complete every condition from `hand`, or null. */
export function planPhase(hand: Card[], conds: Condition[], i = 0): Group[] | null {
	if (i === conds.length) return [];
	for (const g of candidates(conds[i], hand)) {
		const rest = planPhase(without(hand, g), conds, i + 1);
		if (rest) return [g, ...rest];
	}
	return null;
}

/** Roughly how many cards are still missing for the phase, and the cards already working towards it. */
export function missingDetail(hand: Card[], conds: Condition[]): { miss: number; used: Card[] } {
	let rest = [...hand];
	let total = 0;
	const allUsed: Card[] = [];
	for (const cond of conds) {
		let best = { miss: cond.count, used: [] as Card[] };
		const wilds = rest.filter(isWild);
		const plain = rest.filter(c => !isWild(c) && !isSkip(c));
		if (cond.type === 'set' || cond.type === 'color') {
			const key = cond.type === 'set' ? (c: Card) => String(numberOf(c)) : colourOf;
			const buckets = new Map<string, Card[]>();
			for (const c of plain) buckets.set(key(c), [...(buckets.get(key(c)) || []), c]);
			for (const nat of buckets.values()) {
				const use = nat.slice(0, cond.count);
				const w = wilds.slice(0, Math.max(0, cond.count - use.length));
				const miss = cond.count - use.length - w.length;
				if (miss < best.miss || (miss === best.miss && use.length + w.length > best.used.length)) best = { miss, used: [...use, ...w] };
			}
		} else {
			for (let start = 1; start + cond.count - 1 <= 12; start++) {
				const used: Card[] = [];
				for (let k = 0; k < cond.count; k++) {
					const nat = plain.find(c => numberOf(c) === start + k && !used.includes(c) && (cond.type === 'run' || !used.length || colourOf(c) === colourOf(used[0])));
					if (nat) used.push(nat);
				}
				const w = wilds.slice(0, cond.count - used.length);
				const miss = cond.count - used.length - w.length;
				if (miss < best.miss) best = { miss, used: [...used, ...w] };
			}
		}
		total += best.miss;
		allUsed.push(...best.used);
		rest = without(rest, best.used);
	}
	return { miss: total, used: allUsed };
}

export const missing = (hand: Card[], conds: Condition[]) => missingDetail(hand, conds).miss;

/** How much a card is worth keeping (higher = keep). */
export function usefulness(card: Card, hand: Card[], done: boolean, conds: Condition[]): number {
	if (isWild(card)) return 1000;
	if (isSkip(card)) return -5; // throw Skips: they hurt someone else
	if (done) return -penalty(card); // nothing to build: get rid of expensive cards
	const others = hand.filter(c => c !== card && !isWild(c) && !isSkip(c));
	let score = 0;
	for (const cond of conds) {
		if (cond.type === 'set') score = Math.max(score, others.filter(c => numberOf(c) === numberOf(card)).length * 4);
		if (cond.type === 'color') score = Math.max(score, others.filter(c => colourOf(c) === colourOf(card)).length * 2);
		if (cond.type === 'run' || cond.type === 'runcolor') {
			const near = new Set(others.filter(c => Math.abs(numberOf(c) - numberOf(card)) <= 2 && numberOf(c) !== numberOf(card)
				&& (cond.type === 'run' || colourOf(c) === colourOf(card))).map(numberOf));
			const dup = others.some(c => numberOf(c) === numberOf(card));
			score = Math.max(score, near.size * 3 - (dup ? 2 : 0));
		}
	}
	return score - penalty(card) / 100; // tie-break: drop the pricier card
}

/** Least useful card. `extra` adds to a card's keep score (e.g. "don't feed the next player"). */
export function leastUseful(hand: Card[], done: boolean, conds: Condition[], extra: (c: Card) => number = () => 0): Card {
	return [...hand].sort((a, b) => (usefulness(a, hand, done, conds) + extra(a)) - (usefulness(b, hand, done, conds) + extra(b)))[0];
}

export interface Table { conds: Condition[]; groups: Card[][] }

/** Which end a card fits at on a laid-down group, if any. */
export function fitEnd(cond: Condition, group: Card[], card: Card): 'end' | 'start' | null {
	if (placeInGroup(cond.type, group, card, 'end')) return 'end';
	if (placeInGroup(cond.type, group, card, 'start')) return 'start';
	return null;
}

/** Does `card` fit on any of these laid-down tables? */
export function fitsSomewhere(card: Card, tables: Table[]): boolean {
	return tables.some(t => t.groups.some((g, i) => t.conds[i] && !!fitEnd(t.conds[i], g, card)));
}

// ---------- Hint for a person (the Hint button) ----------

export interface HintInput {
	step: 'draw' | 'play' | 'skip';
	hand: Card[];
	staged: Card[][];      // my groups (staged, or laid down when done)
	done: boolean;
	conds: Condition[];
	phase: number;
	top: Card | null;      // top of the discard pile
	tables: Table[];       // every laid-down phase on the table (mine included)
}

export interface Hint {
	message: string;
	keep: Card[];          // glow: worth keeping / can be played
	discard: Card | null;  // glow red: a good card to throw away
	pile?: 'deck' | 'discard';
	arrange?: Card[][];    // a complete phase from hand + staged cards
}

export function hintFor(h: HintInput): Hint {
	const mine = h.done ? h.hand : [...h.hand, ...h.staged.flat()];
	if (h.step === 'skip') return { message: 'Skip the player closest to winning: the highest phase, or the fewest cards.', keep: [], discard: null };

	if (h.step === 'draw') {
		const top = h.top && !isSkip(h.top) ? h.top : null;
		let why = '';
		if (top && isWild(top)) why = 'a Wild fits anywhere';
		else if (top && !h.done && missing([...mine, top], h.conds) < missing(mine, h.conds)) why = 'it brings your phase closer';
		else if (top && h.done && fitsSomewhere(top, h.tables)) why = 'you can add it to a group on the table';
		return why
			? { message: `Take the ${cardLabel(top!)} from the discard pile — ${why}.`, keep: [], discard: null, pile: 'discard' }
			: { message: top ? `The ${cardLabel(top)} doesn’t help you. Draw from the deck.` : 'Draw from the deck.', keep: [], discard: null, pile: 'deck' };
	}

	if (!h.done) {
		const plan = planPhase(mine, h.conds);
		if (plan) {
			const rest = without(mine, plan.flat());
			return {
				message: `You can complete Phase ${h.phase}! Tap Arrange, then Lay Down.`,
				keep: plan.flat(), discard: rest.length ? leastUseful(rest, true, h.conds) : null, arrange: plan,
			};
		}
		const d = missingDetail(mine, h.conds);
		const keep = d.used.filter(c => h.hand.includes(c));
		const spare = h.hand.filter(c => !keep.includes(c));
		const discard = leastUseful(spare.length ? spare : h.hand, false, h.conds);
		return {
			message: `About ${d.miss} more ${d.miss === 1 ? 'card' : 'cards'} needed for Phase ${h.phase}. Keep the glowing cards; the red one is a good discard.`,
			keep, discard,
		};
	}

	const fits = h.hand.filter(c => !isSkip(c) && fitsSomewhere(c, h.tables));
	const spare = h.hand.filter(c => !fits.includes(c));
	// going out: if everything else fits, any last card can be the discard
	const discard = h.hand.length ? leastUseful(spare.length ? spare : h.hand, true, h.conds) : null;
	return fits.length
		? { message: `${fits.length === 1 ? 'The glowing card fits' : 'The glowing cards fit'} on a group on the table. Add ${fits.length === 1 ? 'it' : 'them'}, then discard.`, keep: fits, discard }
		: { message: 'Nothing fits on the table right now. Discard the red card — it costs the most points.', keep: [], discard };
}
