'use client';
import { useEffect, useRef, useState } from 'react';

/** Bottom sheet asking for a private game's 4-digit PIN. */
export default function PinSheet({ gameId, onClose, onSubmit }: { gameId: number; onClose: () => void; onSubmit: (pin: string) => Promise<void> }) {
	const [pin, setPin] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => { input.current?.focus(); }, []);
	useEffect(() => {
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', esc);
		return () => window.removeEventListener('keydown', esc);
	}, [onClose]);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!/^\d{4}$/.test(pin)) { setError('Enter the 4-digit PIN'); return; }
		setBusy(true); setError('');
		try { await onSubmit(pin); } catch (err) { setError((err as Error).message); setBusy(false); }
	}

	return (
		<div className="sheet-backdrop" onClick={onClose}>
			<form className="sheet" role="dialog" aria-modal="true" aria-label={`PIN for game ${gameId}`} onClick={e => e.stopPropagation()} onSubmit={submit}>
				<div className="grabber" />
				<h2>Enter PIN</h2>
				<p className="subtitle center">Game {gameId} is private. Ask the host for its PIN.</p>
				<div className="fields"><div className="field">
					<label htmlFor="pin">PIN</label>
					<input ref={input} id="pin" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code" placeholder="••••" style={{ fontSize: 28, letterSpacing: 12 }} />
				</div></div>
				{error && <div className="error-banner" role="alert">{error}</div>}
				<div style={{ marginTop: 16 }}>
					<button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join Game'}</button>
					<button className="btn btn-plain" type="button" onClick={onClose}>Cancel</button>
				</div>
			</form>
		</div>
	);
}
