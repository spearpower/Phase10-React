'use client';
// Waiting room: invite friends to this table (they get an invite card on Play and a phone alert).
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, avatar } from '@/lib/client';

interface F { id: number; username: string; photo: string; online: boolean; lastSeen: string | null; invited: boolean }

export default function InviteFriends({ gameId, onClose }: { gameId: number; onClose: () => void }) {
	const [list, setList] = useState<F[] | null>(null);
	const [busy, setBusy] = useState(0);
	const [error, setError] = useState('');
	useEffect(() => { api<{ friends: F[] }>(`/api/games/${gameId}/invitable`).then(d => setList(d.friends)).catch(e => setError(e.message)); }, [gameId]);
	const invite = async (f: F) => {
		setBusy(f.id); setError('');
		try { await api('/api/invites', { gameId, to: [f.id] }); setList(l => l?.map(x => x.id === f.id ? { ...x, invited: true } : x) || null); }
		catch (e) { setError((e as Error).message); } finally { setBusy(0); }
	};
	return (
		<div className="sheet-backdrop" onClick={onClose}>
			<div className="sheet" role="dialog" aria-modal="true" aria-label="Invite friends" onClick={e => e.stopPropagation()}>
				<div className="grabber" />
				<h2>Invite friends</h2>
				<p className="subtitle center">They’ll see your invite on their Play page{' '}and get a phone alert if they turned alerts on.</p>
				{list === null ? <p className="hint">Loading…</p> : list.length === 0 ? (
					<div className="empty"><strong>No friends to invite</strong>Add friends on the <Link href="/friends" style={{ color: 'var(--gold)' }}>Friends</Link> tab first.</div>
				) : (
					<div className="list sheet-scroll" style={{ maxHeight: '50vh' }}>
						{list.map(f => (
							<div key={f.id} className="list-row">
								<span className={`av-wrap${f.online ? ' on' : ''}`}><img className="av" src={avatar(f.photo)} alt="" /></span>
								<span className="main"><span className="title">{f.username}</span><span className={`sub${f.online ? ' online' : ''}`}>{f.online ? 'Online now' : 'Offline'}</span></span>
								{f.invited ? <span className="meta">Invited ✓</span>
									: <button type="button" className="icon-btn gold" disabled={busy === f.id} onClick={() => invite(f)}>Invite</button>}
							</div>
						))}
					</div>
				)}
				{error && <div className="error-banner" role="alert">{error}</div>}
				<button className="btn btn-plain" type="button" onClick={onClose} style={{ marginTop: 10 }}>Done</button>
			</div>
		</div>
	);
}
