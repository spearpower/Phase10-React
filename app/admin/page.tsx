'use client';
// Admin hub: app-wide switches, and links to Players and Tables.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Chevron, ErrorBanner, NavBar, Skeleton } from '@/components/ui';

interface Settings { virtualFriends: boolean; voiceChat: boolean; orderShuffle: boolean; voiceReady: boolean; missing?: { voice: string[]; alerts: string[]; dailyJob: string[] } }

export default function AdminPage() {
	const [s, setS] = useState<Settings | null>(null);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState('');

	useEffect(() => { api<Settings>('/api/admin/settings').then(setS).catch(e => setError(e.message)); }, []);

	async function toggle(key: 'virtualFriends' | 'voiceChat' | 'orderShuffle', on: boolean) {
		if (!s) return;
		const before = s;
		setS({ ...s, [key]: on }); setError(''); setSaved('');
		try {
			const next = await api<Settings>('/api/admin/settings', { [key]: on });
			setS(next);
			setSaved(key === 'orderShuffle'
				? (next.orderShuffle ? 'Order Shuffle is on: every new round gets a new playing order, in games already running too' : 'Order Shuffle is off: players keep their seats all game')
				: key === 'virtualFriends'
				? (next.virtualFriends ? 'Virtual Friends are on for everyone' : 'Virtual Friends are off for everyone')
				: (next.voiceChat ? 'Voice chat is on: players can talk at their tables' : 'Voice chat is off'));
		} catch (e) { setError((e as Error).message); setS(before); }
	}

	return (
		<div className="app">
			<NavBar title="Game Settings" back="/account" backLabel="Account" />
			<main>
				<h1 className="large-title">Admin</h1>
				<p className="subtitle">These settings apply to every player.</p>

				<div className="section-title">Manage</div>
				<nav className="group">
					<Link className="row-link" href="/admin/tables">
						<span className="row-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M8 10h8M8 14h5" /></svg></span>
						<span className="row-text"><span className="row-title">Tables</span><span className="row-sub">Live games and open tables · watch or manage</span></span>
						<Chevron />
					</Link>
					<Link className="row-link" href="/admin/players">
						<span className="row-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0 0-6M21.5 20a5 5 0 0 0-4-4.9" /></svg></span>
						<span className="row-text"><span className="row-title">Players</span><span className="row-sub">Reset passwords, suspend, roles</span></span>
						<Chevron />
					</Link>
				</nav>

				<div className="section-title">Switches</div>
				{!s && !error ? <Skeleton rows={2} label="Loading settings" /> : s && (
					<>
						<div className="switch-row">
							<label htmlFor="vf">Virtual Friends</label>
							<span className="switch"><input id="vf" type="checkbox" role="switch" checked={s.virtualFriends} onChange={e => toggle('virtualFriends', e.target.checked)} /><span /></span>
						</div>
						<p className="hint">Practice games against computer players, Quick Game filling, and adding them to empty seats. Games already in progress keep playing.</p>
						<div className="switch-row">
							<label htmlFor="shuffle">Order Shuffle</label>
							<span className="switch"><input id="shuffle" type="checkbox" role="switch" checked={s.orderShuffle} onChange={e => toggle('orderShuffle', e.target.checked)} /><span /></span>
						</div>
						<p className="hint">Each new round is dealt with a new playing order, so players play before or after different people than in the last round. Applies straight away, also to games being played. Tables of 2 just alternate, as always.</p>
						<div className="switch-row">
							<label htmlFor="voice">Voice chat at tables</label>
							<span className="switch"><input id="voice" type="checkbox" role="switch" checked={s.voiceChat} disabled={!s.voiceReady && !s.voiceChat} onChange={e => toggle('voiceChat', e.target.checked)} /><span /></span>
						</div>
						<p className="hint">{s.voiceReady
							? 'Players at the same table can talk (LiveKit, free plan). Each person taps the microphone to join; nobody is heard without choosing to.'
							: <>Voice chat can’t be switched on yet: the server is missing <b>{(s.missing?.voice || []).join(', ') || 'the LiveKit settings'}</b>. Add them in Vercel → Settings → Environment Variables (tick Production), then Redeploy.</>}</p>
					</>
				)}
				{s?.missing && (s.missing.alerts.length > 0 || s.missing.dailyJob.length > 0) && (
					<div className="error-banner" role="status" style={{ marginTop: 14 }}>
						Server settings missing:{s.missing.alerts.length > 0 && <> phone alerts need <b>{s.missing.alerts.join(', ')}</b>;</>}
						{s.missing.dailyJob.length > 0 && <> the daily job needs <b>{s.missing.dailyJob.join(', ')}</b>;</>} add them in Vercel (Production) and Redeploy.
					</div>
				)}
				{saved && <div className="ok-banner" role="status">{saved}</div>}
				<ErrorBanner>{error}</ErrorBanner>
			</main>
		</div>
	);
}
