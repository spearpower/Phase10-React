'use client';
// Play page: one tap to a seat. Joins the fullest open public table, or opens one (Quick Game).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function QuickGameButton({ friends }: { friends: boolean }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	return (
		<>
			<button type="button" className="btn btn-quick" disabled={busy} onClick={async () => {
				setBusy(true); setError('');
				try {
					const r = await api<{ id: number; created: boolean }>('/api/games/quick', {});
					router.push(`/lobby/${r.id}${r.created ? '?quick=1' : ''}`);
				} catch (e) { setError((e as Error).message); setBusy(false); }
			}}>
				<span aria-hidden="true">⚡</span> {busy ? 'Finding a seat…' : 'Quick Game'}
			</button>
			<p className="hint" style={{ marginTop: 6 }}>{friends ? 'Join an open table now. If nobody is waiting, Virtual Friends fill your table after 30 seconds.' : 'Join an open table now, or open one for others to join.'}</p>
			{error && <div className="error-banner" role="alert">{error}</div>}
		</>
	);
}
