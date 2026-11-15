'use client';
// Account → Delete my account. Asks for the password and the word DELETE, explains exactly what happens.
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';

export default function DeleteAccount({ superAdmin }: { superAdmin: boolean }) {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const ready = password.length > 0 && confirm.trim().toUpperCase() === 'DELETE';

	async function go() {
		setBusy(true); setError('');
		try {
			await api('/api/account/delete', { password, confirm });
			try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
			window.location.href = '/signin?deleted=1';
		} catch (e) { setError((e as Error).message); setBusy(false); }
	}

	return (
		<>
			<button type="button" className="btn btn-danger delete-account" onClick={() => setOpen(true)}>Delete My Account</button>
			{open && (
				<div className="sheet-backdrop" onClick={() => !busy && setOpen(false)}>
					<div className="sheet" role="dialog" aria-modal="true" aria-label="Delete my account" onClick={e => e.stopPropagation()}>
						<div className="grabber" />
						<h2>Delete your account?</h2>
						{superAdmin ? (
							<p className="subtitle center">The super admin account can’t be deleted. Make someone else super admin first.</p>
						) : (
							<>
								<ul className="delete-list">
									<li>You leave any game you’re in; the others carry on.</li>
									<li>Your name, email, phone, avatar and password are erased, and you’re signed out everywhere.</li>
									<li>Your chat messages, leaderboard points, titles, friends and alerts are deleted.</li>
									<li>Your seat in others’ finished games stays as an anonymous “Deleted” player so their scores still add up.</li>
									<li><b>This can’t be undone.</b> <Link href="/privacy" style={{ color: 'var(--gold)' }}>Privacy Policy</Link></li>
								</ul>
								<div className="fields">
									<div className="field"><label htmlFor="del-pw">Your password</label>
										<input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
									<div className="field"><label htmlFor="del-confirm">Type DELETE to confirm</label>
										<input id="del-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="DELETE" /></div>
								</div>
								{error && <div className="error-banner" role="alert">{error}</div>}
								<div style={{ marginTop: 14 }}>
									<button className="btn btn-danger-solid" type="button" disabled={!ready || busy} onClick={go}>{busy ? 'Deleting…' : 'Delete My Account'}</button>
								</div>
							</>
						)}
						<button className="btn btn-plain" type="button" disabled={busy} onClick={() => setOpen(false)}>Keep My Account</button>
					</div>
				</div>
			)}
		</>
	);
}
