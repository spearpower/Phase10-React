'use client';
// Admin "Watch": a read-only view of a table the admin isn't playing at.
// Shows what everyone at the table can see (laid-down groups, card counts, discard pile) — never anyone's hand.
import Link from 'next/link';
import { useState } from 'react';
import { avatar, cardSrc, type GameData } from '@/lib/client';
import { conditionLabel } from '@/lib/rules';
import { ruleSet } from '@/lib/rulesets';
import TableMenu from './TableMenu';

export default function WatchBoard({ data, onChanged }: { data: GameData; onChanged: () => void }) {
	const v = data.watch!;
	const [menu, setMenu] = useState(false);
	const person = (id: number) => data.players.find(p => p.id === id);
	const nameOf = (id: number) => person(id)?.username || 'Player';
	const line = (l: string) => l.replace(/\{(\d+)\}/g, (_, x) => nameOf(Number(x)));
	const top = v.discard[0];
	const status = data.status === 'playing' ? (v.turn ? `${nameOf(v.turn)}’s turn` : 'Between turns')
		: data.status === 'finished' ? `Finished · ${nameOf(v.finished?.standings[0]?.id ?? 0)} won` : data.status === 'ended' ? 'Ended' : data.status;
	return (
		<div className="app watch">
			<header className="navbar">
				<Link className="nav-back" href="/admin/tables"><svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" /></svg><span>Tables</span></Link>
				<h1 className="nav-title">Watching game {data.id}</h1>
				<div className="nav-trailing">{data.canManage && data.status === 'playing' && <button type="button" onClick={() => setMenu(true)}>Manage</button>}</div>
			</header>
			<main>
				<div className="watch-head">
					<span className="pill live">{data.status === 'playing' ? '● Live' : status}</span>
					<span>{ruleSet(data.edition).name} · Round {v.round}{data.practice ? ' · with Virtual Friends' : ''}</span>
				</div>
				<p className="subtitle" style={{ marginTop: 6 }}>{status}. You can see the table, not anyone’s hand.</p>
				<div className="watch-center">
					<div className="pilewrap"><div className="pile">{top ? <img src={cardSrc(top)} alt={`Discard: ${top}`} /> : null}</div><span className="pile-label">Discard</span></div>
					<div className="pilewrap"><div className="pile"><img src="/cards/back.svg" alt="" /><span className="count">{v.deckCount}</span></div><span className="pile-label">Deck</span></div>
				</div>
				<div className="watch-players">
					{v.order.map(id => {
						const p = v.players.find(x => x.id === id)!;
						const who = person(id);
						return (
							<div key={id} className={`rival watch-rival${v.turn === id ? ' turn' : ''}`}>
								<div className="top">
									<img className="av" src={avatar(who?.photo || 'na.png')} alt="" />
									<div className="who">
										<span className="nm">{nameOf(id)}{who?.isBot && <> <span className="vf-badge">Virtual</span></>}</span>
										<span className="st">Phase {p.phase} · {p.score} pts{p.skipped ? ' · skipped next' : ''}</span>
									</div>
									<span className={`cnt${p.handCount <= 2 ? ' low' : ''}`} aria-label={`${p.handCount} cards in hand`}>{p.handCount}</span>
								</div>
								{p.done && p.groups ? (
									<div className="rgroups" style={{ flexDirection: 'row' }}>
										{p.conditions.map((c, g) => (
											<div key={g} className="rgroup">
												<div className="rg-row"><span className="rg-cards">{(p.groups![g] || []).map((card, i) => <img key={card + i} className="mini" src={cardSrc(card)} alt={card} />)}</span></div>
												<span className="lbl">{conditionLabel(c)}</span>
											</div>
										))}
									</div>
								) : <span className="st" style={{ fontSize: 12, color: 'var(--label-3)' }}>Working on: {p.conditions.map(conditionLabel).join(' + ')}</span>}
							</div>
						);
					})}
				</div>
				{v.log.length > 0 && <>
					<div className="section-title">Latest</div>
					<ul className="watch-log">{v.log.map((l, i) => <li key={i}>{line(l)}</li>)}</ul>
				</>}
			</main>
			{menu && <TableMenu edition={data.edition} gameId={data.id} me={data.me} canManage players={data.players.filter(p => !p.left)} inGame={false}
				onClose={() => setMenu(false)} onDone={() => { setMenu(false); onChanged(); }} />}
		</div>
	);
}
