'use client';
// Shown after an admin reset the password: the player must choose their own before playing.
import { useState } from 'react';
import { api } from '@/lib/client';
import { ErrorBanner } from '@/components/ui';

export default function NewPasswordPage() {
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	async function save(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		setBusy(true); setError('');
		try {
			await api('/api/account/new-password', { next: f.get('next'), repeat: f.get('repeat') });
			window.location.href = '/';
		} catch (err) { setError((err as Error).message); setBusy(false); }
	}
	return (
		<div className="app centered">
			<main className="center">
				<div className="brand"><img src="/icons/icon-192.png" alt="" /><h1 className="large-title">Choose a new password</h1></div>
				<p className="subtitle">An admin reset your password. Pick a new one that only you know.</p>
				<form onSubmit={save} noValidate style={{ width: '100%' }}>
					<div className="fields">
						<div className="field"><label htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={6} required autoFocus /></div>
						<div className="field"><label htmlFor="repeat">Repeat it</label><input id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={6} required /></div>
					</div>
					<p className="hint">At least 6 characters.</p>
					<button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and Play'}</button>
					<ErrorBanner>{error}</ErrorBanner>
				</form>
			</main>
		</div>
	);
}
