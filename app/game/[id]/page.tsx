'use client';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, avatar, cardSrc, haptic, useGame, type GameData } from '@/lib/client';
import { conditionLabel, meetsCondition, placeInGroup, type Condition } from '@/lib/rules';
import type { Action, GameView, PlayerView } from '@/lib/engine';
import { initSound, playSound, playTurnSound, setSoundOn, soundOn } from '@/lib/sound';
import { Bubbles, Confetti, Crown, type Bubble, type BubbleKind } from '@/components/Celebrate';
import TableChat from '@/components/TableChat';
import TableMenu from '@/components/TableMenu';

// Pure helpers (no node 'crypto' import on the client)
const isWild = (c: string) => c[1] === 'w';
const isSkip = (c: string) => c[1] === 's';
const num = (c: string) => (isWild(c) || isSkip(c) ? 99 : parseInt(c.slice(2), 10));
const COLOUR: Record<string, string> = { r: 'Red', b: 'Blue', y: 'Yellow', g: 'Green' };
const label = (c: string) => (isWild(c) ? 'Wild' : isSkip(c) ? 'Skip' : `${COLOUR[c[1]]} ${num(c)}`);
type Sort = 'dealt' | 'number' | 'colour';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
	const id = Number(use(params).id);
	const router = useRouter();
	const { data, error: loadError, accept, serverNow, refresh } = useGame(id);
	const [selected, setSelected] = useState<string | null>(null);
	const [toast, setToast] = useState('');
	const [optimistic, setOptimistic] = useState<GameView | null>(null);
	const queue = useRef<Promise<void>>(Promise.resolve());
	const inflight = useRef(0);
	const [fresh, setFresh] = useState<string[]>([]);     // cards that just arrived in the hand
	const prevHand = useRef<string[] | null>(null);
	const [sort, setSort] = useState<Sort>('number');
	const [seenRound, setSeenRound] = useState(0);
	const [left, setLeft] = useState<number | null>(null);
	const reported = useRef<string | null>(null);
	const wasMyTurn = useRef(false);
	const [sound, setSound] = useState(true);
	useEffect(() => { initSound(); setSound(soundOn()); }, []);
	const [bubbles, setBubbles] = useState<Bubble[]>([]);
	const [menuOpen, setMenuOpen] = useState(false);
	const [party, setParty] = useState<null | 'round' | 'win'>(null);
	const bubbleSeq = useRef(0);
	const prevView = useRef<GameView | null>(null);
	const bubble = useCallback((text: string, kind: BubbleKind, ms = 2800) => {
		const bid = ++bubbleSeq.current;
		setBubbles(b => [...b.slice(-2), { id: bid, text, kind }]);
		setTimeout(() => setBubbles(b => b.filter(x => x.id !== bid)), ms);
	}, []);

	// What we show: the server's view, or our prediction while moves are on their way
	const view = optimistic ?? data?.view ?? null;
	const viewRef = useRef<GameView | null>(null);
	viewRef.current = view;
	const me = data?.me ?? 0;
	const names = useMemo(() => Object.fromEntries((data?.players || []).map(p => [p.id, p])), [data?.players]);
	const nameOf = useCallback((pid: number) => (pid === me ? 'You' : names[pid]?.username || 'Player'), [names, me]);

	// lobby / redirects
	useEffect(() => {
		if (!data) return;
		if (data.status === 'lobby') router.replace(`/lobby/${id}`);
	}, [data, id, router]);

	// briefly highlight cards that just arrived (drawn)
	useEffect(() => {
		const h = view?.hand;
		if (!h) return;
		if (prevHand.current) {
			const added = h.filter(c => !prevHand.current!.includes(c) && c !== PENDING);
			if (added.length) { setFresh(added); const t = setTimeout(() => setFresh([]), 700); prevHand.current = h; return () => clearTimeout(t); }
		}
		prevHand.current = h;
	}, [view?.hand]);

	// ----- table events: compare the previous view with the new one (same on every phone) -----
	useEffect(() => {
		const v = view, p = prevView.current;
		prevView.current = v;
		if (!v || !p) return; // first load: don't replay old events
		const who = (pid: number | null | undefined) => (pid === me ? 'You' : (pid && names[pid]?.username) || 'Someone');

		if (v.finished && !p.finished) {
			const w = v.finished.standings[0].id;
			bubble(w === me ? 'You won the game!' : `${who(w)} wins the game!`, 'win', 5500);
			playSound('win'); haptic(60); setParty('win');
			return;
		}
		if (v.round > p.round && v.lastRound && v.lastRound.round === p.round) {
			const w = v.lastRound.wentOut;
			bubble(w ? (w === me ? `You won round ${p.round}!` : `${who(w)} won round ${p.round}!`) : `Round ${p.round} is over`, 'round', 4000);
			playSound('round'); setParty('round');
			return;
		}
		if (v.round !== p.round) return;

		// new log lines since last time (newest first)
		const fresh = newLogLines(p.log, v.log);
		for (const line of [...fresh].reverse()) {
			const done = /^\{(\d+)\} completed phase (\d+)$/.exec(line);
			if (done) {
				const pid = Number(done[1]);
				bubble(pid === me ? `You completed Phase ${done[2]}!` : `${who(pid)} completed Phase ${done[2]}!`, 'phase', 3200);
				playSound('phase');
			}
			const gone = /^\{(\d+)\} left the game · (.+)$/.exec(line);
			if (gone) { bubble(`${who(Number(gone[1]))} left the game · ${gone[2]}`, 'skip', 3500); playSound('skip'); }
			const out = /^\{(\d+)\} was removed by \{(\d+)\} · (.+)$/.exec(line);
			if (out) { bubble(`${who(Number(out[2]))} removed ${who(Number(out[1]))} · ${out[3]}`, 'skip', 3500); playSound('skip'); }
			const sk = /^\{(\d+)\} skipped \{(\d+)\}$/.exec(line);
			if (sk) {
				const by = Number(sk[1]), target = Number(sk[2]);
				if (target === me) { bubble(`${who(by)} skipped you`, 'skip', 3000); playSound('skip'); haptic(40); }
				else bubble(`${who(by)} skipped ${who(target)}`, 'info', 2400);
			}
		}

		// discards: the top card changed and it wasn't someone taking it
		const topNow = v.discard[0], topBefore = p.discard[0];
		if (topNow && topNow !== topBefore && topNow !== p.discard[1]) {
			playSound('discard');
			if (p.turn !== me && p.turn !== null) bubble(`${who(p.turn)} discarded ${label(topNow)}`, 'discard', 2200);
		}
	}, [view, me, names, bubble]);

	useEffect(() => { if (!party) return; const t = setTimeout(() => setParty(null), party === 'win' ? 4200 : 2400); return () => clearTimeout(t); }, [party]);

	// keep the selection valid
	useEffect(() => { if (selected && view && !view.hand.includes(selected)) setSelected(null); }, [view, selected]);

	// haptic tick when your turn starts
	const myTurn = !!view && view.turn === me;
	useEffect(() => {
		if (myTurn && !wasMyTurn.current) { haptic(30); playTurnSound(); if (prevView.current) bubble('Your turn!', 'turn', 1800); }
		wasMyTurn.current = myTurn;
	}, [myTurn]);

	// turn timer (server clock), and report a timeout once when it hits zero
	useEffect(() => {
		if (!data?.deadline || data.status !== 'playing') { setLeft(null); return; }
		const tick = () => {
			const s = Math.max(0, Math.ceil((new Date(data.deadline!).getTime() - serverNow()) / 1000));
			setLeft(s);
			if (s === 0 && reported.current !== data.deadline) {
				reported.current = data.deadline;
				api<GameData>(`/api/games/${id}/move`, { type: 'timeout' }).then(accept).catch(() => refresh());
			}
		};
		tick();
		const t = setInterval(tick, 250);
		return () => clearInterval(t);
	}, [data?.deadline, data?.status, id, accept, refresh, serverNow]);

	const say = (msg: string) => { setToast(msg); haptic(8); setTimeout(() => setToast(t => (t === msg ? '' : t)), 2600); };

	/** Show the predicted result now, send the move in order, and reconcile with the server's answer. */
	const send = useCallback((action: Action) => {
		const cur = viewRef.current;
		const predicted = cur ? predict(cur, me, action) : null;
		if (predicted) setOptimistic(predicted);
		setSelected(null);
		inflight.current++;
		queue.current = queue.current.then(async () => {
			try {
				const d = await api<GameData>(`/api/games/${id}/move`, action);
				accept(d);
			} catch (e) {
				inflight.current = 1; // drop the rest of this burst: it was based on the refused move
				say((e as Error).message);
				await refresh();
			} finally {
				inflight.current = Math.max(0, inflight.current - 1);
				if (inflight.current === 0) setOptimistic(null);
			}
		});
	}, [id, me, accept, refresh]);

	if (data?.myLeft) {
		const byMe = data.myLeft.by === data.me;
		return (
			<div className="app centered"><main className="center">
				<div className="brand"><img src="/icons/icon-192.png" alt="" /><h1 className="large-title">{byMe ? 'You left this game' : 'You were removed'}</h1></div>
				<p className="subtitle">{byMe ? `Reason: ${data.myLeft.reason || '—'}` : `${data.myLeft.byName || 'The host'} removed you from game ${data.id}. Reason: ${data.myLeft.reason || '—'}`}</p>
				<Link className="btn btn-primary" href="/">Back to Play</Link>
			</main></div>
		);
	}
	if (data && !view && data.canManage && data.status === 'playing') {
		return (
			<div className="app"><main>
				<h1 className="large-title">Game {data.id}</h1>
				<p className="subtitle">You’re not playing at this table. As a super admin you can remove players or end the game.</p>
				<button className="btn btn-primary" type="button" onClick={() => setMenuOpen(true)}>Table Options</button>
				<Link className="btn btn-plain" href="/">Back to Play</Link>
				{menuOpen && <TableMenu gameId={id} me={me} canManage players={data.players} inGame={false} onClose={() => setMenuOpen(false)}
					onDone={() => { setMenuOpen(false); refresh(); }} />}
			</main></div>
		);
	}
	if (!data || !view) {
		return (
			<div className="board" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
				<div className="thint">{loadError || 'Dealing cards…'}</div>
				{loadError && <Link className="icon-btn gold" href="/continue">Back</Link>}
			</div>
		);
	}

	const mine = view.players.find(p => p.id === me)!;
	const step = view.step;
	const top = view.discard[0];
	const rivals = rotate(view.order, me).filter(x => x !== me).map(x => view.players.find(p => p.id === x)!);
	const canPlay = myTurn && step === 'play';
	const allMet = mine.conditions.every((c, i) => meetsCondition(c, mine.groups?.[i] || []));
	const staged = !mine.done && (mine.groups || []).some(g => g.length);
	const hand = sortHand(view.hand, sort);

	// ----- hint text -----
	let hint = '', hintKind = 'wait';
	if (view.finished) { hint = 'Game over'; }
	else if (data.status === 'ended') { hint = 'Game ended'; }
	else if (myTurn && step === 'draw') { hint = 'Your turn · Draw a card'; hintKind = 'me'; }
	else if (myTurn && step === 'skip') { hint = 'Tap a player to skip'; hintKind = 'skip'; }
	else if (myTurn) {
		hintKind = 'me';
		hint = selected ? (mine.done ? 'Tap a group or the discard pile' : 'Tap a group or the discard pile')
			: mine.done ? 'Add to a group, then discard' : allMet ? 'Tap Lay Down, then discard' : 'Build your phase, then discard';
	} else {
		hint = names[view.turn!]?.isBot ? `${nameOf(view.turn!)} is thinking…` : `${nameOf(view.turn!)}’s turn${mine.skipped ? ' · You’ll be skipped' : ''}`;
	}

	// ----- actions -----
	const tapDeck = () => { if (myTurn && step === 'draw') { fly('[data-drop="deck"]', '.hand', '/cards/back.svg'); send({ type: 'draw', from: 'deck' }); } else if (myTurn) say(step === 'skip' ? 'Choose a player to skip first' : 'You’ve already drawn — now play or discard'); else say('Wait for your turn'); };
	const tapDiscard = () => {
		if (!myTurn) return say('Wait for your turn');
		if (step === 'draw') {
			if (top && isSkip(top)) return say('A Skip can’t be taken — draw from the deck');
			if (top) fly('[data-drop="discard"]', '.hand', cardSrc(top));
			return send({ type: 'draw', from: 'discard' });
		}
		if (step === 'play') {
			if (!selected) return say('Tap a card in your hand first');
			fly(`[data-card="${selected}"]`, '[data-drop="discard"]', cardSrc(selected));
			return send({ type: 'discard', card: selected });
		}
		say('Choose a player to skip first');
	};
	const tapMyGroup = (g: number) => {
		if (!selected) return say(mine.done ? 'Select a card to add' : 'Select a card from your hand first');
		if (mine.done && !canPlay) return say('You can add to groups on your turn, after drawing');
		const end = fitEnd(mine.conditions[g], mine.groups?.[g] || [], selected);
		if (!end) return say('That card doesn’t fit there');
		fly(`[data-card="${selected}"]`, `[data-drop="g${g}"]`, cardSrc(selected));
		send({ type: 'place', card: selected, group: g, end });
	};
	const tapRivalGroup = (r: PlayerView, g: number) => {
		if (!selected) return say('Select a card to add');
		if (!canPlay) return say('You can add cards on your turn, after drawing');
		if (!mine.done) return say('Lay down your own phase first');
		const end = fitEnd(r.conditions[g], r.groups?.[g] || [], selected);
		if (!end) return say('That card doesn’t fit there');
		fly(`[data-card="${selected}"]`, `[data-drop="r${r.id}-${g}"]`, cardSrc(selected));
		send({ type: 'hit', target: r.id, group: g, card: selected, end });
	};
	const tapRival = (r: PlayerView) => { if (myTurn && step === 'skip' && view.skipTargets.includes(r.id)) send({ type: 'skip', target: r.id }); };

	const lastLog = (view.log[0] || '').replace(/\{(\d+)\}/g, (_, x) => nameOf(Number(x)));
	const showRound = !view.finished && view.lastRound && view.lastRound.round === view.round - 1 && seenRound !== view.lastRound.round;

	return (
		<div className={`board${myTurn && !view.finished ? ' myturn' : ''}${myTurn && step === 'draw' ? ' mustdraw' : ''}`}>
			{/* Rivals */}
			<section className={`rivals${rivals.length >= 3 ? ' compact' : ''}`} style={{ ['--rc' as string]: rivals.length <= 3 ? rivals.length : rivals.length === 4 ? 2 : 3 }} aria-label="Other players">
				{rivals.map(r => {
					const target = myTurn && step === 'skip' && view.skipTargets.includes(r.id);
					return (
						<div key={r.id} className={`rival${view.turn === r.id ? ' turn' : ''}${target ? ' target' : ''}`}
							role={target ? 'button' : undefined} tabIndex={target ? 0 : undefined} aria-label={target ? `Skip ${nameOf(r.id)}` : undefined}
							onClick={() => tapRival(r)} onKeyDown={e => { if (e.key === 'Enter') tapRival(r); }}>
							{r.skipped && <span className="badge pill orange">Skipped next</span>}
							{view.turn === r.id && !view.finished && <span className="ribbon">{names[r.id]?.isBot ? 'Thinking…' : 'Playing'}</span>}
							{view.finished?.standings[0].id === r.id && <span className="badge crown-badge"><Crown size={22} title="Winner" /></span>}
							<div className="top">
								<img className="av" src={avatar(names[r.id]?.photo || 'na.png')} alt="" />
								<div className="who">
									<span className="nm">{nameOf(r.id)}{names[r.id]?.isBot && <> <span className="vf-badge">Virtual</span></>}</span>
									<span className="st">Phase {r.phase} · {r.score} pts{view.turn === r.id ? (names[r.id]?.isBot ? ' · thinking…' : left !== null ? ` · ${left}s` : '') : ''}</span>
								</div>
								<span className={`cnt${r.handCount <= 2 ? ' low' : ''}`} aria-label={`${r.handCount} cards in hand`}>{r.handCount}</span>
							</div>
							{r.done && r.groups && (
								<div className="rgroups">
									{r.conditions.map((c, g) => (
										<button key={g} type="button" data-drop={`r${r.id}-${g}`} className={`rgroup${selected && canPlay && mine.done ? ' can-drop' : ''}`}
											onClick={e => { e.stopPropagation(); tapRivalGroup(r, g); }} aria-label={`${nameOf(r.id)}: ${conditionLabel(c)}`}>
											<span className="lbl">{conditionLabel(c)}</span>
											<Minis cards={r.groups![g]} />
										</button>
									))}
								</div>
							)}
							{!r.done && <span className="st" style={{ fontSize: 12, color: 'var(--label-3)' }}>{r.conditions.map(conditionLabel).join(' + ')}</span>}
						</div>
					);
				})}
			</section>

			{/* Piles + hint */}
			<section className="table-center">
				<div className="hintrow">
					<div className={`thint ${hintKind}`} role="status" aria-live="polite">{hint}</div>
					{left !== null && view.turn === me && <div className={`timer${left <= 10 ? ' low' : ''}`} aria-label={`${left} seconds left`}>{left}</div>}
				</div>
				<div className="piles">
					<div className="pilewrap">
						<button type="button" data-drop="discard" className={`pile${!top ? ' empty' : ''}${myTurn && step === 'draw' && top && !isSkip(top) ? ' go' : ''}${canPlay && selected ? ' drop' : ''}`}
							onClick={tapDiscard} aria-label={top ? `Discard pile, top card ${label(top)}` : 'Discard pile, empty'}>
							{top && <img key={top} className="drop-in" src={cardSrc(top)} alt="" />}
						</button>
						<span className="pile-label">Discard</span>
					</div>
					<div className="pilewrap">
						<button type="button" data-drop="deck" className={`pile${myTurn && step === 'draw' ? ' go' : ''}`} onClick={tapDeck} aria-label={`Deck, ${view.deckCount} cards`}>
							<img src="/cards/back.svg" alt="" />
							<span className="count">{view.deckCount}</span>
						</button>
						<span className="pile-label">Deck</span>
					</div>
				</div>
				{lastLog && <div className="footnote" style={{ margin: 0 }}>{lastLog}</div>}
			</section>

			{/* My groups */}
			<section className="mine" aria-label={`Your phase ${mine.phase}`}>
				<div className="mgroups">
					{mine.conditions.map((c, g) => {
						const cards = mine.groups?.[g] || [];
						const ok = meetsCondition(c, cards);
						return (
							<div key={g} className={`mgroup${mine.done ? ' done' : ''}${selected && (!mine.done || canPlay) ? ' can-drop' : ''}`}>
								<span className="lbl">{conditionLabel(c)} {ok && !mine.done ? '✓' : ''}</span>
								<button type="button" className="cards" data-drop={`g${g}`} onClick={() => tapMyGroup(g)} aria-label={`${conditionLabel(c)}: ${cards.length ? cards.map(label).join(', ') : 'empty'}`}>
									{cards.length ? <Minis cards={cards} /> : <span className="empty-msg">{selected ? 'Tap to place' : 'Empty'}</span>}
								</button>
							</div>
						);
					})}
				</div>
			</section>

			{/* Actions */}
			<div className="actions">
				{!mine.done && <button type="button" className="icon-btn gold" disabled={!canPlay || !allMet} onClick={() => send({ type: 'layDown' })}>Lay Down</button>}
				{staged && <button type="button" className="icon-btn" onClick={() => send({ type: 'unstage' })}>Take Back</button>}
				<button type="button" className="icon-btn" onClick={() => setSort(s => (s === 'number' ? 'colour' : s === 'colour' ? 'dealt' : 'number'))} aria-label={`Sort hand, now by ${sort}`}>
					Sort: {sort === 'number' ? '1–12' : sort === 'colour' ? 'Colour' : 'As dealt'}
				</button>
			</div>

			{/* Hand */}
			<section className="hand" style={{ ['--n' as string]: hand.length }} aria-label={`Your hand, ${hand.length} cards`}>
				{hand.map(c => c === PENDING ? (
					<span key={c} className="card pending" aria-label="Drawing a card…"><img src="/cards/back.svg" alt="" /></span>
				) : (
					<button key={c} type="button" data-card={c} className={`card${selected === c ? ' sel' : ''}${fresh.includes(c) ? ' arrive' : ''}`} aria-pressed={selected === c} aria-label={label(c)}
						onPointerDown={() => { haptic(6); setSelected(sel => (sel === c ? null : c)); }}
						onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(sel => (sel === c ? null : c)); } }}>
						<img src={cardSrc(c)} alt="" />
					</button>
				))}
			</section>

			{/* Status bar */}
			<footer className="gbar">
				<Link href="/" aria-label="Leave the table. Your game is saved; rejoin from Continue.">
					<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" /></svg>Menu
				</Link>
				<span className="me-info"><b>{names[me]?.username}</b> · Phase {mine.phase} · Round {view.round}</span>
				<span>{mine.score} pts</span>
				{data.status === 'playing' && (
					<button type="button" onClick={() => setMenuOpen(true)} aria-label="Table options: leave, remove a player, end game" style={{ fontSize: 22, letterSpacing: 1 }}>⋯</button>
				)}
				<button type="button" aria-pressed={sound} aria-label={sound ? 'Turn chime on. Tap to mute.' : 'Turn chime off. Tap to unmute.'}
					onClick={() => { const on = !sound; setSound(on); setSoundOn(on); }}>
					<svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20, strokeWidth: 2 }}>
						<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
						{!sound && <path d="M3 3l18 18" />}
					</svg>
				</button>
			</footer>

			<TableChat gameId={id} me={me} people={names} chatLast={data.chatLast || 0} />
			<Bubbles items={bubbles} allTop={!!view.finished} />
			{party && <Confetti big={party === 'win'} />}
			{toast && <div className="toast" role="alert">{toast}</div>}
			{showRound && view.lastRound && <RoundSheet view={view} nameOf={nameOf} onClose={() => setSeenRound(view.lastRound!.round)} />}
			{view.finished && <FinishedSheet data={data} view={view} nameOf={nameOf} />}
			{data.status === 'ended' && !view.finished && <EndedSheet data={data} nameOf={nameOf} />}
			{menuOpen && (
				<TableMenu gameId={id} me={me} canManage={!!data.canManage} players={data.players.filter(p => view.order.includes(p.id))} inGame
					onClose={() => setMenuOpen(false)}
					onDone={what => { setMenuOpen(false); if (what === 'left') router.replace('/'); else refresh(); }} />
			)}
		</div>
	);
}

function Minis({ cards }: { cards: string[] }) {
	return <>{cards.map((c, i) => <img key={c + i} className="mini" src={cardSrc(c)} alt={label(c)} />)}</>;
}

function RoundSheet({ view, nameOf, onClose }: { view: GameView; nameOf: (id: number) => string; onClose: () => void }) {
	// close by itself after 8 s (the board refreshes often, so keep the timer independent of re-renders)
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	useEffect(() => { const t = setTimeout(() => closeRef.current(), 8000); return () => clearTimeout(t); }, []);
	const r = view.lastRound!;
	return (
		<div className="sheet-backdrop" onClick={onClose}>
			<div className="sheet" role="dialog" aria-modal="true" aria-label={`Round ${r.round} results`} onClick={e => e.stopPropagation()}>
				<div className="grabber" />
				<h2>{r.wentOut ? <><Crown size={24} /> {nameOf(r.wentOut)} {r.wentOut === view.myId ? 'win' : 'wins'} round {r.round}</> : `Round ${r.round} done`}</h2>
				<p className="subtitle center">Round {view.round} is dealt. Players who completed their phase move up.</p>
				<div className="list">
					{[...r.results].sort((a, b) => a.score - b.score).map(x => (
						<div key={x.id} className="list-row">
							<span className="main">
								<span className="title">{nameOf(x.id)}{r.wentOut === x.id && <> <Crown size={16} title="Went out" /></>}</span>
								<span className="sub">{x.completed ? `Completed phase ${x.phase} ✓` : `Stays on phase ${x.phase}`}</span>
							</span>
							<span className="meta">+{x.penalty}<br /><b>{x.score}</b> pts</span>
						</div>
					))}
				</div>
				<div style={{ marginTop: 16 }}><button className="btn btn-primary" type="button" onClick={onClose}>Play Round {view.round}</button></div>
			</div>
		</div>
	);
}

function FinishedSheet({ data, view, nameOf }: { data: GameData; view: GameView; nameOf: (id: number) => string }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const st = view.finished!.standings;
	const isHost = data.me === data.hostId;
	const myPts = st.find(s => s.id === data.me)?.points ?? 0;
	return (
		<div className="sheet-backdrop">
			<div className="sheet" role="dialog" aria-modal="true" aria-label="Final standings">
				<div className="grabber" />
				<div className="winner-crown"><Crown size={56} title="Winner" /></div>
				<h2>{st[0].id === data.me ? 'You won!' : `${nameOf(st[0].id)} wins!`}</h2>
				<p className="subtitle center">{data.practice
					? 'Practice game with Virtual Friends — no leaderboard points.'
					: <>You earned <b style={{ color: 'var(--gold)' }}>{myPts}</b> {myPts === 1 ? 'point' : 'points'} for the monthly leaderboard.</>}</p>
				<div className="list">
					{st.map(s => (
						<div key={s.id} className={`list-row${s.id === data.me ? ' me' : ''}`}>
							<span className="rank">{s.rank}</span>
							<span className="main"><span className="title">{nameOf(s.id)}{s.rank === 1 && <> <Crown size={16} /></>}</span><span className="sub">Phase {s.phase} · {s.score} pts</span></span>
							{!data.practice && <span className="meta"><b>+{s.points}</b></span>}
						</div>
					))}
				</div>
				<div style={{ marginTop: 16 }}>
					{isHost ? (
						<button className="btn btn-primary" type="button" disabled={busy} onClick={async () => {
							setBusy(true);
							try { const { id } = await api<{ id: number }>(`/api/games/${data.id}/again`, {}); router.push(`/lobby/${id}`); }
							catch (e) { setError((e as Error).message); setBusy(false); }
						}}>Play Again</button>
					) : data.nextGameId ? (
						<Link className="btn btn-primary" href={`/lobby/${data.nextGameId}`}>Join the Next Game</Link>
					) : (
						<p className="footnote center">Waiting for the host to start another game…</p>
					)}
					<Link className="btn btn-plain" href="/">Back to Play</Link>
					{error && <div className="error-banner">{error}</div>}
				</div>
			</div>
		</div>
	);
}

function rotate(order: number[], me: number) {
	const i = order.indexOf(me);
	return i < 0 ? order : [...order.slice(i), ...order.slice(0, i)];
}

function sortHand(hand: string[], sort: Sort) {
	if (sort === 'dealt') return hand;
	const colourRank = (c: string) => 'rbyg'.indexOf(c[1]) + (isWild(c) ? 10 : isSkip(c) ? 11 : 0);
	return [...hand].sort((a, b) => (sort === 'number' ? num(a) - num(b) || colourRank(a) - colourRank(b) : colourRank(a) - colourRank(b) || num(a) - num(b)));
}

/** Which end of the group the card fits at (end preferred), or null. */
function fitEnd(cond: Condition, group: string[], card: string): 'end' | 'start' | null {
	if (placeInGroup(cond.type, group, card, 'end')) return 'end';
	if (placeInGroup(cond.type, group, card, 'start')) return 'start';
	return null;
}

/** Placeholder for a card being drawn from the deck (its face is unknown until the server answers). */
const PENDING = '0??';

/** Predict the visible result of my move, so the card moves at once. The server's answer replaces it. */
function predict(v: GameView, me: number, a: Action): GameView | null {
	const n: GameView = { ...v, hand: [...v.hand], discard: [...v.discard], players: v.players.map(p => ({ ...p, groups: p.groups ? p.groups.map(g => [...g]) : null })) };
	const mine = n.players.find(p => p.id === me);
	if (!mine) return null;
	const take = (c: string) => { const i = n.hand.indexOf(c); if (i >= 0) n.hand.splice(i, 1); };
	const nextAfter = () => n.order[(n.order.indexOf(me) + 1) % n.order.length];
	switch (a.type) {
		case 'draw':
			if (a.from === 'discard') { const top = n.discard.shift(); if (top) n.hand.push(top); }
			else { n.hand.push(PENDING); n.deckCount = Math.max(0, n.deckCount - 1); }
			n.step = 'play';
			return n;
		case 'discard': {
			take(a.card);
			n.discard = [a.card, ...n.discard].slice(0, 3);
			const targets = n.players.filter(p => p.id !== me && !p.skipped).map(p => p.id);
			if (a.card[1] === 's' && targets.length && n.hand.length) { n.step = 'skip'; n.skipTargets = targets; }
			else { n.turn = nextAfter(); n.step = 'draw'; n.skipTargets = []; }
			return n;
		}
		case 'place':
			take(a.card);
			if (mine.groups) mine.groups[a.group] = a.end === 'start' ? [a.card, ...mine.groups[a.group]] : [...mine.groups[a.group], a.card];
			return n;
		case 'hit': {
			take(a.card);
			const t = n.players.find(p => p.id === a.target);
			if (t?.groups) t.groups[a.group] = a.end === 'start' ? [a.card, ...t.groups[a.group]] : [...t.groups[a.group], a.card];
			return n;
		}
		case 'unstage':
			if (mine.groups) { n.hand.push(...mine.groups.flat()); mine.groups = mine.groups.map(() => []); }
			return n;
		case 'layDown':
			mine.done = true;
			return n;
		case 'skip':
			n.turn = nextAfter(); n.step = 'draw'; n.skipTargets = [];
			return n;
		default:
			return null;
	}
}

/** Animate a card image flying from one element to another (skipped when reduced motion is on). */
function fly(fromSel: string, toSel: string, src: string) {
	if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const from = document.querySelector(fromSel), to = document.querySelector(toSel);
	if (!from || !to) return;
	const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
	const img = document.createElement('img');
	img.src = src; img.className = 'flyer'; img.alt = '';
	Object.assign(img.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
	document.body.appendChild(img);
	// land on the right-hand end of the hand, or the centre of a pile / group
	const intoHand = toSel === '.hand';
	const tx = (intoHand ? b.right - a.width - 12 : b.left + b.width / 2 - a.width / 2) - a.left;
	const ty = (intoHand ? b.bottom - a.height - 6 : b.top + b.height / 2 - a.height / 2) - a.top;
	const scale = intoHand ? 1 : Math.max(0.45, Math.min(1, b.height / a.height));
	const anim = img.animate(
		[{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${tx}px, ${ty}px) scale(${scale})` }],
		{ duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' },
	);
	anim.onfinish = () => img.remove();
	anim.oncancel = () => img.remove();
}

/** Log lines added since `before` (logs are newest-first and capped, so align on the old head). */
function newLogLines(before: string[], after: string[]): string[] {
	if (!before.length) return after;
	for (let i = 0; i <= after.length; i++) {
		const k = Math.min(3, before.length, after.length - i);
		if (k > 0 && after.slice(i, i + k).every((x, j) => x === before[j])) return after.slice(0, i);
	}
	return after;
}

function EndedSheet({ data, nameOf }: { data: GameData; nameOf: (id: number) => string }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const by = data.ended?.by;
	return (
		<div className="sheet-backdrop">
			<div className="sheet" role="dialog" aria-modal="true" aria-label="Game ended">
				<div className="grabber" />
				<h2>Game ended</h2>
				<p className="subtitle center">{by ? `${by === data.me ? 'You' : data.ended?.byName || nameOf(by)} ended the game.` : 'The game ended.'} Reason: <b>{data.ended?.reason || '—'}</b><br />No leaderboard points were given.</p>
				<div style={{ marginTop: 16 }}>
					{data.me === data.hostId && (
						<button className="btn btn-primary" type="button" disabled={busy} onClick={async () => {
							setBusy(true);
							try { const { id } = await api<{ id: number }>(`/api/games/${data.id}/again`, {}); router.push(`/lobby/${id}`); }
							catch (e) { setError((e as Error).message); setBusy(false); }
						}}>Play Again</button>
					)}
					{data.me !== data.hostId && data.nextGameId && <Link className="btn btn-primary" href={`/lobby/${data.nextGameId}`}>Join the Next Game</Link>}
					<Link className="btn btn-plain" href="/">Back to Play</Link>
					{error && <div className="error-banner">{error}</div>}
				</div>
			</div>
		</div>
	);
}
