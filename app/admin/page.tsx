'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { ErrorBanner, NavBar, Skeleton } from '@/components/ui';

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
			</main>
		</div>
	);
}
