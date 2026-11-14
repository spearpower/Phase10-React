'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, avatar } from '@/lib/client';
import { ErrorBanner, NavBar, Skeleton } from '@/components/ui';

interface LiveTable {
	id: number; host: string; round: number; timer_sec: number; updated_at: string; practice: boolean; stale: boolean;
	players: { id: number; username: string; photo: string; isBot: boolean }[]; turn: string | null;
}
interface Live { superAdmin: boolean; staleHours: number; serverNow: string; tables: LiveTable[] }

const ago = (iso: string, now: string) => {
	const m = Math.max(0, Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60000));
	return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

function LiveTables() {
	const [live, setLive] = useState<Live | null>(null);
	const [error, setError] = useState('');
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const load = useCallback(() => api<Live>('/api/admin/games').then(d => { setLive(d); setError(''); }).catch(e => setError(e.message)), []);
	useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
	const stale = live?.tables.filter(t => t.stale).length || 0;
	return (
		<>
			<div className="section-title">Live tables{live ? ` · ${live.tables.length}` : ''}</div>
			{!live && !error ? <Skeleton rows={2} label="Loading tables" /> : live && live.tables.length === 0 ? (
				<div className="empty"><strong>No games being played</strong>Tables appear here once a game starts.</div>
			) : live && (
				<div className="list">
					{live.tables.map(t => (
						<div key={t.id} className="list-row live-row">
							<span className="main">
								<span className="title">Game {t.id} · Round {t.round}{t.practice ? ' · practice' : ''}{t.stale ? <span className="badge pill orange" style={{ marginLeft: 6 }}>Stuck</span> : null}</span>
								<span className="sub">Host {t.host} · last move {ago(t.updated_at, live.serverNow)}{t.turn ? ` · ${t.turn}’s turn` : ''}{t.timer_sec ? ` · ${t.timer_sec}s timer` : ' · no timer'}</span>
								<span className="avs">{t.players.map(p => <img key={p.id} src={avatar(p.photo)} alt={p.username} title={p.username} />)}</span>
							</span>
							{live.superAdmin && <Link className="icon-btn" href={`/game/${t.id}`}>Manage</Link>}
						</div>
					))}
				</div>
			)}
			<p className="hint">{live?.superAdmin ? 'Manage opens the table, where you can remove players or end the game.' : 'Only the super admin can manage tables they aren’t playing at.'}</p>
			<div className="section-title">Stuck games</div>
			<p className="hint" style={{ marginTop: 0 }}>Games with no moves for {live?.staleHours ?? 24} hours are closed automatically: waiting rooms are cancelled, and games are ended with no leaderboard points. {stale ? `${stale} ${stale === 1 ? 'game is' : 'games are'} stuck right now.` : 'Nothing is stuck right now.'}</p>
			<button className="btn btn-plain" type="button" disabled={busy} onClick={async () => {
				setBusy(true); setNote(''); setError('');
				try {
					const r = await api<{ lobbies: number; games: number }>('/api/admin/games', { cleanup: true });
					setNote(r.lobbies + r.games ? `Closed ${r.games} ${r.games === 1 ? 'game' : 'games'} and ${r.lobbies} waiting ${r.lobbies === 1 ? 'room' : 'rooms'}.` : 'Nothing needed closing.');
					await load();
				} catch (e) { setError((e as Error).message); } finally { setBusy(false); }
			}}>{busy ? 'Checking…' : 'Close Stuck Games Now'}</button>
			{note && <div className="ok-banner" role="status">{note}</div>}
			<ErrorBanner>{error}</ErrorBanner>
		</>
	);
}

export default function AdminPage() {
	const [vf, setVf] = useState<boolean | null>(null);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState('');

	useEffect(() => {
		api<{ virtualFriends: boolean }>('/api/admin/settings').then(s => setVf(s.virtualFriends)).catch(e => setError(e.message));
	}, []);

	async function toggle(on: boolean) {
		setVf(on); setError(''); setSaved('');
		try {
			const s = await api<{ virtualFriends: boolean }>('/api/admin/settings', { virtualFriends: on });
			setVf(s.virtualFriends);
			setSaved(s.virtualFriends ? 'Virtual Friends are on for everyone' : 'Virtual Friends are off for everyone');
		} catch (e) { setError((e as Error).message); setVf(!on); }
	}

	return (
		<div className="app">
			<NavBar title="Game Settings" back="/account" backLabel="Account" />
			<main>
				<h1 className="large-title">Admin</h1>
				<p className="subtitle">These settings apply to every player.</p>
				<div className="section-title">Virtual Friends</div>
				{vf === null && !error ? <Skeleton rows={1} label="Loading settings" /> : vf !== null && (
					<>
						<div className="switch-row">
							<label htmlFor="vf">Virtual Friends</label>
							<span className="switch"><input id="vf" type="checkbox" role="switch" checked={vf} onChange={e => toggle(e.target.checked)} /><span /></span>
						</div>
						<p className="hint">When on, players can start practice games against computer players and add them to empty seats. Games already in progress keep playing.</p>
					</>
				)}
				{saved && <div className="ok-banner" role="status">{saved}</div>}
				<ErrorBanner>{error}</ErrorBanner>
				<LiveTables />
			</main>
		</div>
	);
}
