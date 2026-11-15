import { after } from 'next/server';
import { body, fail, json, withUser } from '@/lib/http';
import { move } from '@/lib/games';
import { notifyGame } from '@/lib/realtime';
import { alertTurn } from '@/lib/push';
import { Action } from '@/lib/engine';

type Ctx = { params: Promise<{ id: string }> };
const CARD = /^[1-8](?:[rbyg](?:[1-9]|1[0-2])|ss|ww)$/;

/** Only well-formed actions reach the engine. */
function parse(a: Record<string, unknown>): Action | null {
	const card = typeof a.card === 'string' && CARD.test(a.card) ? a.card : null;
	const end = a.end === 'start' ? 'start' : 'end';
	const int = (v: unknown) => (Number.isInteger(Number(v)) ? Number(v) : NaN);
	switch (a.type) {
		case 'draw': return a.from === 'discard' ? { type: 'draw', from: 'discard' } : { type: 'draw', from: 'deck' };
		case 'place': return card && int(a.group) >= 0 ? { type: 'place', card, group: int(a.group), end } : null;
		case 'unstage': return { type: 'unstage' };
		case 'layDown': return { type: 'layDown' };
		case 'hit': return card && int(a.group) >= 0 && int(a.target) > 0 ? { type: 'hit', card, group: int(a.group), target: int(a.target), end } : null;
		case 'discard': return card ? { type: 'discard', card } : null;
		case 'skip': return int(a.target) > 0 ? { type: 'skip', target: int(a.target) } : null;
		case 'timeout': return { type: 'timeout' };
		default: return null;
	}
}

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const action = parse(await body<Record<string, unknown>>(req) as Record<string, unknown>);
	if (!action) return fail('That move isn’t valid');
	const r = await move(user, Number(id), action);
	// Tell the other players after we've answered: the mover never waits for the broadcast
	if (r.changed) after(async () => {
		await notifyGame(Number(id), r.version);
		// the turn may have passed to someone who isn't looking: buzz their phone
		if (action.type === 'discard' || action.type === 'skip' || action.type === 'timeout') await alertTurn(Number(id));
	});
	return json(r);
});
