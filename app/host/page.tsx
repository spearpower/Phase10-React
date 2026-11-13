'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { ErrorBanner, NavBar } from '@/components/ui';

export default function HostPage() {
	const router = useRouter();
	const [pin, setPin] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function create(e: React.FormEvent) {
		e.preventDefault();
		if (pin && !/^\d{4}$/.test(pin)) { setError('The PIN must be 4 digits, or leave it empty.'); return; }
		setBusy(true); setError('');
		try {
			const { id } = await api<{ id: number }>('/api/games', { pin, timer: 40 });
			router.replace(`/lobby/${id}`);
		} catch (err) { setError((err as Error).message); setBusy(false); }
	}

	return (
		<div className="app has-dock">
			<NavBar title="Host a Game" back="/" backLabel="Play" />
			<main>
				<form onSubmit={create} noValidate>
					<h1 className="large-title">New table</h1>
					<p className="subtitle">You’ll get a game number and a link to share with friends.</p>
					<div className="section-title">Who can join</div>
					<div className="fields">
						<div className="field">
							<label htmlFor="pin">PIN (optional)</label>
							<input id="pin" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="No PIN — anyone can join" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" />
						</div>
					</div>
					<p className="hint">Add a 4-digit PIN to make the game private.</p>
					<div className="section-title">Rules</div>
					<div className="fields"><div className="field"><label>Rule set</label><div style={{ minHeight: 32, padding: '4px 0' }}>Classic — 10 phases</div></div></div>
					<div className="dock"><div>
						<button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create Game'}</button>
						<ErrorBanner>{error}</ErrorBanner>
					</div></div>
				</form>
			</main>
		</div>
	);
}
