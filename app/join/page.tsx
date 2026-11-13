'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, avatar, realtimeEnabled, subscribe } from '@/lib/client';
import { ErrorBanner, NavBar, Skeleton } from '@/components/ui';
import PinSheet from '@/components/PinSheet';

interface OpenGame { id: number; private: boolean; host: string; photo: string; players: number }

export default function JoinPage() {
	const router = useRouter();
	const [games, setGames] = useState<OpenGame[] | null>(null);
	const [q, setQ] = useState('');
	const [publicOnly, setPublicOnly] = useState(false);
	const [error, setError] = useState('');
	const [pinFor, setPinFor] = useState<number | null>(null);

	const load = useCallback(async () => {
		try {
			const d = await api<{ games: OpenGame[] }>(`/api/games?public=${publicOnly ? 1 : 0}&q=${encodeURIComponent(q)}`);
			setGames(d.games);
		} catch (e) { setError((e as Error).message); }
	}, [q, publicOnly]);

	useEffect(() => {
		load();
		const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, realtimeEnabled ? 8000 : 4000);
		const unsub = subscribe('lobbies', load);
		return () => { clearInterval(t); unsub(); };
	}, [load]);

	async function join(g: OpenGame, pin?: string) {
		setError('');
		try {
			await api(`/api/games/${g.id}/join`, { pin: pin || '' });
			router.push(`/lobby/${g.id}`);
		} catch (e) {
			const err = e as Error & { status?: number };
			if (err.status === 403 && !pin) { setPinFor(g.id); return; }
			if (pin) throw e;
			setError(err.message);
		}
	}

	return (
		<div className="app">
			<NavBar title="Join a Game" back="/" backLabel="Play" />
			<main>
				<label className="search">
					<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
					<span className="sr-only">Search by game number</span>
					<input type="search" value={q} onChange={e => setQ(e.target.value.replace(/\D/g, ''))} placeholder="Game number" inputMode="numeric" autoComplete="off" enterKeyHint="search" />
				</label>
				<div className="switch-row">
					<label htmlFor="pub">Only games without a PIN</label>
					<span className="switch"><input id="pub" type="checkbox" role="switch" checked={publicOnly} onChange={e => setPublicOnly(e.target.checked)} /><span /></span>
				</div>

				<div className="section-title">Open tables</div>
				{games === null ? <Skeleton label="Looking for games" /> : games.length === 0 ? (
					<div className="empty">
						<strong>No open tables right now</strong>
						Ask a friend for their game number or invite link, or host your own table.
						<Link className="btn btn-primary" href="/host">Host a Game</Link>
					</div>
				) : (
					<div className="list" aria-live="polite">
						{games.map(g => (
							<button key={g.id} className="list-row" type="button" onClick={() => (g.private ? setPinFor(g.id) : join(g))}>
								<img className="av" src={avatar(g.photo)} alt="" />
								<span className="main">
									<span className="title">{g.host}’s table</span>
									<span className="sub">Game {g.id} · {g.players}/6 players {g.private && <span className="pill gold">PIN</span>}</span>
								</span>
								<span className="icon-btn gold" aria-hidden="true">Join</span>
							</button>
						))}
					</div>
				)}
				<p className="footnote">Tables appear while their host is in the waiting room.</p>
				<ErrorBanner>{error}</ErrorBanner>
			</main>
			{pinFor !== null && (
				<PinSheet gameId={pinFor} onClose={() => setPinFor(null)}
					onSubmit={async pin => { await join({ id: pinFor } as OpenGame, pin); }} />
			)}
		</div>
	);
}
