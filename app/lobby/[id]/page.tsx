'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, avatar, useGame } from '@/lib/client';
import { ErrorBanner, NavBar, Skeleton } from '@/components/ui';
import PinSheet from '@/components/PinSheet';

const TIMERS = [0, 20, 30, 40, 60];

export default function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
	const id = Number(use(params).id);
	const router = useRouter();
	const { data, error: loadError, refresh } = useGame(id);
	const [timer, setTimer] = useState(40);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [pinOpen, setPinOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => { if (data?.status === 'playing' && data.isMember) router.replace(`/game/${id}`); }, [data, id, router]);
	useEffect(() => { if (data) setTimer(t => (data.timerSec && t === 40 ? data.timerSec : t)); }, [data]);

	if (!data) return (
		<div className="app"><NavBar title="Waiting Room" back="/" backLabel="Play" />
			<main>{loadError ? <ErrorBanner>{loadError}</ErrorBanner> : <Skeleton rows={2} label="Loading table" />}</main></div>
	);

	const myId = data.me;
	const isHost = myId === data.hostId;
	const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };

	if (data.status === 'abandoned') return (
		<div className="app"><NavBar title="Waiting Room" back="/" backLabel="Play" />
			<main><div className="empty"><strong>This table was closed</strong>The host cancelled this game.<Link className="btn btn-primary" href="/join">Find Another Table</Link></div></main></div>
	);

	const invite = async () => {
		const url = `${location.origin}/lobby/${id}`;
		const text = `Join my Rummy10 table — game ${id}${data.pin ? `, PIN ${data.pin}` : ''}`;
		try {
			if (navigator.share) await navigator.share({ title: 'Rummy10', text, url });
			else { await navigator.clipboard.writeText(`${text}: ${url}`); setCopied(true); setTimeout(() => setCopied(false), 2500); }
		} catch { /* share cancelled */ }
	};

	return (
		<div className="app has-dock">
			<NavBar title="Waiting Room" back="/" backLabel="Play" trailing={<button type="button" onClick={invite}>{copied ? 'Copied' : 'Invite'}</button>} />
			<main>
				<div className="lobby-head">
					<div className="stat"><div className="k">Game number</div><div className="v">{id}</div></div>
					<div className="stat"><div className="k">PIN</div><div className="v">{data.isMember ? (data.pin || <span className="code-none">None</span>) : (data.private ? '••••' : <span className="code-none">None</span>)}</div></div>
				</div>
				<p className="footnote" role="status">
					{!data.isMember ? 'You’re not at this table yet.' : isHost ? 'Share the game number or tap Invite. You need at least 2 players.' : 'You’re in. The game starts when the host taps Start.'}
				</p>

				<div className="section-title">Players · {data.players.length}/6</div>
				<div className="list" aria-live="polite">
					{data.players.map(p => (
						<div className="list-row" key={p.id}>
							<img className="av" src={avatar(p.photo)} alt="" />
							<span className="main">
								<span className="title">{p.username}{p.id === myId ? ' (you)' : ''}</span>
								<span className="sub">{p.id === data.hostId ? 'Host' : 'Player'} · {p.online ? 'Here' : 'Away'}</span>
							</span>
							<span className={`dot${p.online ? ' on' : ''}`} aria-hidden="true" />
							{isHost && p.id !== myId && (
								<button className="icon-btn danger" type="button" disabled={busy} aria-label={`Remove ${p.username}`}
									onClick={() => act(() => api(`/api/games/${id}/kick`, { userId: p.id }))}>Remove</button>
							)}
						</div>
					))}
					{Array.from({ length: Math.max(0, 6 - data.players.length) }, (_, i) => (
						<div className="list-row" key={`open-${i}`} style={{ minHeight: 48 }}><span className="main"><span className="open-seat">Open seat</span></span></div>
					))}
				</div>

				{isHost && (
					<>
						<div className="section-title">Turn timer</div>
						<div className="segmented" role="radiogroup" aria-label="Turn timer">
							{TIMERS.map(t => (
								<label key={t}><input type="radio" name="timer" checked={timer === t} onChange={() => setTimer(t)} /><span>{t ? `${t}s` : 'Off'}</span></label>
							))}
						</div>
						<p className="hint">When time runs out, the turn is played automatically.</p>
					</>
				)}

				<div className="dock"><div>
					{!data.isMember ? (
						<button className="btn btn-primary" type="button" disabled={busy}
							onClick={() => (data.private ? setPinOpen(true) : act(() => api(`/api/games/${id}/join`, {})))}>Join This Table</button>
					) : isHost ? (
						<>
							<button className="btn btn-primary" type="button" disabled={busy || data.players.length < 2}
								onClick={() => act(async () => { await api(`/api/games/${id}/start`, { timer }); router.replace(`/game/${id}`); })}>
								{data.players.length < 2 ? 'Waiting for players…' : 'Start Game'}
							</button>
							<button className="btn btn-plain" type="button" disabled={busy}
								onClick={() => act(async () => { await api(`/api/games/${id}/leave`, {}); router.replace('/'); })}>Cancel Table</button>
						</>
					) : (
						<button className="btn btn-danger" type="button" disabled={busy}
							onClick={() => act(async () => { await api(`/api/games/${id}/leave`, {}); router.replace('/join'); })}>Leave Table</button>
					)}
					<ErrorBanner>{error || loadError}</ErrorBanner>
				</div></div>
			</main>
			{pinOpen && <PinSheet gameId={id} onClose={() => setPinOpen(false)} onSubmit={async pin => { await api(`/api/games/${id}/join`, { pin }); setPinOpen(false); await refresh(); }} />}
		</div>
	);
}
