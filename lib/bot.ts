// Virtual Friend player. Every move goes through the engine (`apply`), so it plays by the same rules as people.
import { apply, autoPlay, GameError, GameState, PlayerState, skipTargets } from './engine';
import { Card, colourOf, isSkip, isWild, numberOf, penalty } from './card-codes';
import { Condition, placeInGroup } from './rules';

type Group = Card[];

// ---------- Planning a phase ----------

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

const without = (cards: Card[], used: Card[]) => {
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

/** Roughly how many cards are still missing for the phase (lower is better). */
export function missing(hand: Card[], conds: Condition[]): number {
	let rest = [...hand];
	let total = 0;
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
				if (miss < best.miss) best = { miss, used: [...use, ...w] };
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
		rest = without(rest, best.used);
	}
	return total;
}

// ---------- Choosing cards ----------

function usefulness(card: Card, hand: Card[], p: PlayerState, conds: Condition[]): number {
	if (isWild(card)) return 1000;
	if (isSkip(card)) return -5; // throw Skips: they hurt someone else
	if (p.done) return -penalty(card); // nothing to build: get rid of expensive cards
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

function chooseDiscard(s: GameState, p: PlayerState): Card {
	const conds = s.phases[String(p.phase)] || [];
	return [...p.hand].sort((a, b) => usefulness(a, p.hand, p, conds) - usefulness(b, p.hand, p, conds))[0];
}

/** Skip whoever is most dangerous: highest phase, then fewest cards in hand. */
function chooseSkipTarget(s: GameState, me: number): number {
	const targets = skipTargets(s, me).map(id => s.players[String(id)]);
	targets.sort((a, b) => (b.phase + (b.done ? 0.5 : 0)) - (a.phase + (a.done ? 0.5 : 0)) || a.hand.length - b.hand.length);
	return targets[0].id;
}

// ---------- One full turn ----------

/** Plays the whole turn for Virtual Friend `id`. Never throws: falls back to the engine's auto-play. */
export function botTurn(s: GameState, id: number): { roundEnded: boolean } {
	const roundBefore = s.round;
	const ended = () => s.round !== roundBefore || !!s.finished;
	try {
		const p = s.players[String(id)];
		const conds = () => s.phases[String(p.phase)] || [];

		if (s.step === 'skip') {
			apply(s, id, { type: 'skip', target: chooseSkipTarget(s, id) });
			return { roundEnded: false };
		}

		if (!p.done && p.groups.some(g => g.length)) apply(s, id, { type: 'unstage' });

		// 1. Draw: take the discard only if it brings the phase closer (or it's a Wild)
		if (s.step === 'draw') {
			const top = s.discard[0];
			let take = false;
			if (top && !isSkip(top)) {
				if (isWild(top)) take = true;
				else if (!p.done) take = missing([...p.hand, top], conds()) < missing(p.hand, conds());
				else take = s.order.some(t => {
					const o = s.players[String(t)];
					return o.done && o.groups.some((g, gi) => {
						const c = (s.phases[String(o.phase)] || [])[gi];
						return c && (placeInGroup(c.type, g, top, 'end') || placeInGroup(c.type, g, top, 'start'));
					});
				});
			}
			apply(s, id, { type: 'draw', from: take ? 'discard' : 'deck' });
		}

		// 2. Lay down the phase if possible
		if (!p.done) {
			const plan = planPhase(p.hand, conds());
			if (plan) {
				plan.forEach((g, gi) => g.forEach(card => apply(s, id, { type: 'place', card, group: gi, end: 'end' })));
				const r = apply(s, id, { type: 'layDown' });
				if (r.roundEnded) return r;
			}
		}

		// 3. Hit: add every card that fits anywhere (own groups first)
		if (p.done) {
			let progress = true;
			while (progress && p.hand.length > 0 && !ended()) {
				progress = false;
				for (const card of [...p.hand]) {
					if (isSkip(card) && p.hand.length > 1) continue;
					for (const t of [id, ...s.order.filter(x => x !== id)]) {
						const o = s.players[String(t)];
						if (!o.done) continue;
						const oc = s.phases[String(o.phase)] || [];
						for (let gi = 0; gi < o.groups.length && !progress; gi++) {
							const c = oc[gi];
							if (!c) continue;
							const end = placeInGroup(c.type, o.groups[gi], card, 'end') ? 'end' : placeInGroup(c.type, o.groups[gi], card, 'start') ? 'start' : null;
							if (!end) continue;
							// keep one card to discard unless this goes out
							const r = t === id ? apply(s, id, { type: 'place', card, group: gi, end }) : apply(s, id, { type: 'hit', target: t, group: gi, card, end });
							if (r.roundEnded) return r;
							progress = true;
						}
						if (progress) break;
					}
					if (progress) break;
				}
			}
		}
		if (ended()) return { roundEnded: true };

		// 4. Discard, then skip someone if it was a Skip
		const r = apply(s, id, { type: 'discard', card: chooseDiscard(s, p) });
		if (r.roundEnded) return r;
		if ((s.step as string) === 'skip' && s.turn === id) apply(s, id, { type: 'skip', target: chooseSkipTarget(s, id) });
		return { roundEnded: ended() };
	} catch (e) {
		if (!(e instanceof GameError)) throw e;
		if (s.turn === id && !s.finished) return autoPlay(s);
		return { roundEnded: ended() };
	}
}
