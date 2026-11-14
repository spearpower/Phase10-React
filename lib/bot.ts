// Virtual Friend player. Every move goes through the engine (`apply`), so it plays by the same rules as people.
// Three levels (chosen per table, stored in the game state):
//   easy   — lays down when it can, only adds to its own groups, throws away a random card half the time, only takes a Wild from the discard
//   normal — plans its phase, takes useful discards, adds to anyone's groups, skips the leader
//   smart  — normal, plus it avoids discarding cards the next player could use, and skips whoever is about to go out
import { apply, autoPlay, BotLevel, GameError, GameState, skipTargets } from './engine';
import { Card, isSkip, isWild } from './card-codes';
import { fitEnd, fitsSomewhere, leastUseful, missing, planPhase, Table } from './plan';

export { planPhase, missing } from './plan';

const levelOf = (s: GameState): BotLevel => s.botLevel || 'normal';
const randomOf = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function tablesOf(s: GameState, only?: number): Table[] {
	return s.order.filter(t => only === undefined || t === only).map(t => s.players[String(t)])
		.filter(o => o.done).map(o => ({ conds: s.phases[String(o.phase)] || [], groups: o.groups }));
}

function chooseDiscard(s: GameState, id: number, taken: Card | null): Card {
	const p = s.players[String(id)];
	const conds = s.phases[String(p.phase)] || [];
	const level = levelOf(s);
	// never throw straight back the card just taken from the discard pile (that can loop forever)
	const keepTaken = (c: Card) => (c === taken && p.hand.length > 1 ? 1000 : 0);
	if (level === 'easy' && Math.random() < 0.5) {
		// half the time an easy friend throws away a random card
		const plain = p.hand.filter(c => !isWild(c) && c !== taken);
		return randomOf(plain.length ? plain : p.hand);
	}
	if (level === 'smart') {
		// The next player can take the discard: don't hand them a card they could play
		const next = s.order[(s.order.indexOf(id) + 1) % s.order.length];
		const n = s.players[String(next)];
		const nTables = n?.done ? tablesOf(s) : [];
		return leastUseful(p.hand, p.done, conds, c => keepTaken(c) + (nTables.length && !isSkip(c) && fitsSomewhere(c, nTables) ? 40 : 0));
	}
	return leastUseful(p.hand, p.done, conds, keepTaken);
}

/** normal: highest phase, then fewest cards. smart: anyone close to going out first. easy: anyone. */
function chooseSkipTarget(s: GameState, me: number): number {
	const targets = skipTargets(s, me).map(id => s.players[String(id)]);
	if (levelOf(s) === 'easy') return randomOf(targets).id;
	if (levelOf(s) === 'smart') {
		const close = targets.filter(t => t.done && t.hand.length <= 3).sort((a, b) => a.hand.length - b.hand.length);
		if (close.length) return close[0].id;
	}
	targets.sort((a, b) => (b.phase + (b.done ? 0.5 : 0)) - (a.phase + (a.done ? 0.5 : 0)) || a.hand.length - b.hand.length);
	return targets[0].id;
}

// ---------- One full turn ----------

/** Plays the whole turn for Virtual Friend `id`. Never throws: falls back to the engine's auto-play. */
export function botTurn(s: GameState, id: number): { roundEnded: boolean } {
	const roundBefore = s.round;
	const ended = () => s.round !== roundBefore || !!s.finished;
	const level = levelOf(s);
	try {
		const p = s.players[String(id)];
		const conds = () => s.phases[String(p.phase)] || [];

		if (s.step === 'skip') {
			apply(s, id, { type: 'skip', target: chooseSkipTarget(s, id) });
			return { roundEnded: false };
		}

		if (!p.done && p.groups.some(g => g.length)) apply(s, id, { type: 'unstage' });

		// 1. Draw: take the discard only if it brings the phase closer (or it's a Wild)
		let taken: Card | null = null;
		if (s.step === 'draw') {
			const top = s.discard[0];
			let take = false;
			// safety net: after a long run of discard-pile pickups, go to the deck
			const pickups = s.log.slice(0, 6).filter(l => l.endsWith('took from the discard pile')).length;
			if (top && !isSkip(top)) {
				if (isWild(top)) take = true;
				else if (level === 'easy') take = false;
				else if (!p.done) take = missing([...p.hand, top], conds()) < missing(p.hand, conds());
				else take = fitsSomewhere(top, tablesOf(s));
			}
			if (take && pickups >= 6 && !isWild(top)) take = false;
			if (take) taken = top;
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

		// 3. Hit: add every card that fits (own groups first; easy only uses its own)
		if (p.done) {
			let progress = true;
			while (progress && p.hand.length > 0 && !ended()) {
				progress = false;
				for (const card of [...p.hand]) {
					if (isSkip(card) && p.hand.length > 1) continue;
					const owners = level === 'easy' ? [id] : [id, ...s.order.filter(x => x !== id)];
					for (const t of owners) {
						const o = s.players[String(t)];
						if (!o.done) continue;
						const oc = s.phases[String(o.phase)] || [];
						for (let gi = 0; gi < o.groups.length && !progress; gi++) {
							const c = oc[gi];
							if (!c) continue;
							const end = fitEnd(c, o.groups[gi], card);
							if (!end) continue;
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
		const r = apply(s, id, { type: 'discard', card: chooseDiscard(s, id, taken) });
		if (r.roundEnded) return r;
		if ((s.step as string) === 'skip' && s.turn === id) apply(s, id, { type: 'skip', target: chooseSkipTarget(s, id) });
		return { roundEnded: ended() };
	} catch (e) {
		if (!(e instanceof GameError)) throw e;
		if (s.turn === id && !s.finished) return autoPlay(s);
		return { roundEnded: ended() };
	}
}
