'use client';
// Friends: find players, requests, who's online. Invites to tables show on the Play page.
import { useCallback, useEffect, useState } from 'react';
import { api, avatar } from '@/lib/client';
import { ErrorBanner, NavBar, Skeleton, TabBar } from '@/components/ui';

interface Person { id: number; username: string; photo: string; online: boolean; lastSeen: string | null }
interface Found extends Person { relation: 'friend' | 'incoming' | 'outgoing' | null }
interface View { friends: Person[]; incoming: Person[]; outgoing: Person[] }

const seen = (p: Person) => {
	if (p.online) return 'Online now';
	if (!p.lastSeen) return 'Not seen yet';
	const m = Math.round((Date.now() - new Date(p.lastSeen).getTime()) / 60000);
	return `Seen ${m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`} ago`;
};

export default function FriendsPage() {
	const [v, setV] = useState<View | null>(null);
	const [q, setQ] = useState('');
	const [found, setFound] = useState<Found[]>([]);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(0);
	const [open, setOpen] = useState<Person | null>(null);

	const load = useCallback(() => api<View>('/api/friends').then(d => { setV(d); setError(''); }).catch(e => setError(e.message)), []);
	useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
	useEffect(() => {
		if (q.trim().length < 2) { setFound([]); return; }
		const t = setTimeout(() => api<{ players: Found[] }>(`/api/friends/search?q=${encodeURIComponent(q.trim())}`).then(d => setFound(d.players)).catch(() => {}), 250);
		return () => clearTimeout(t);
	}, [q]);

	const act = async (action: string, userId: number) => {
		setBusy(userId); setError('');
		try {
			await api('/api/friends', { action, userId });
			await load();
			setFound(f => f.map(p => p.id !== userId ? p : { ...p, relation: action === 'request' ? (p.relation === 'incoming' ? 'friend' : 'outgoing') : action === 'accept' ? 'friend' : null }));
			setOpen(null);
		} catch (e) { setError((e as Error).message); } finally { setBusy(0); }
	};

	return (
		<div className="app has-tabs">
			<NavBar />
			<main>
				<h1 className="large-title">Friends</h1>
				<div className="fields" style={{ marginBottom: 6 }}>
					<div className="field"><label htmlFor="find">Find a player</label>
						<input id="find" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Type a username" autoComplete="off" autoCapitalize="none" enterKeyHint="search" /></div>
				</div>
				{q.trim().length >= 2 && (
					found.length === 0 ? <p className="hint">No players match “{q.trim()}”.</p> : (
						<div className="list" style={{ marginTop: 8 }}>
							{found.map(p => (
								<div key={p.id} className="list-row">
									<span className={`av-wrap${p.online ? ' on' : ''}`}><img className="av" src={avatar(p.photo)} alt="" /></span>
									<span className="main"><span className="title">{p.username}</span><span className="sub">{seen(p)}</span></span>
									{p.relation === 'friend' ? <span className="meta">Friend ✓</span>
										: p.relation === 'outgoing' ? <span className="meta">Request sent</span>
										: <button className="icon-btn gold" type="button" disabled={busy === p.id} onClick={() => act('request', p.id)}>{p.relation === 'incoming' ? 'Accept' : 'Add Friend'}</button>}
								</div>
							))}
						</div>
					)
				)}

				{!v ? (error ? null : <Skeleton rows={3} label="Loading friends" />) : (
					<>
						{v.incoming.length > 0 && <>
							<div className="section-title">Friend requests · {v.incoming.length}</div>
							<div className="list">
								{v.incoming.map(p => (
									<div key={p.id} className="list-row">
										<img className="av" src={avatar(p.photo)} alt="" />
										<span className="main"><span className="title">{p.username}</span><span className="sub">wants to be friends</span></span>
										<button className="icon-btn gold" type="button" disabled={busy === p.id} onClick={() => act('accept', p.id)}>Accept</button>
										<button className="icon-btn" type="button" disabled={busy === p.id} onClick={() => act('decline', p.id)} aria-label={`Decline ${p.username}`}>✕</button>
									</div>
								))}
							</div>
						</>}

						<div className="section-title">Your friends · {v.friends.length}</div>
						{v.friends.length === 0 ? (
							<div className="empty"><strong>No friends yet</strong>Find players above by username and add them. Then invite them to your tables from the waiting room.</div>
						) : (
							<div className="list">
								{v.friends.map(p => (
									<button key={p.id} type="button" className="list-row" onClick={() => setOpen(p)}>
										<span className={`av-wrap${p.online ? ' on' : ''}`}><img className="av" src={avatar(p.photo)} alt="" /></span>
										<span className="main"><span className="title">{p.username}</span><span className={`sub${p.online ? ' online' : ''}`}>{seen(p)}</span></span>
									</button>
								))}
							</div>
						)}

						{v.outgoing.length > 0 && <>
							<div className="section-title">Waiting for them</div>
							<div className="list">
								{v.outgoing.map(p => (
									<div key={p.id} className="list-row">
										<img className="av" src={avatar(p.photo)} alt="" />
										<span className="main"><span className="title">{p.username}</span><span className="sub">Request sent</span></span>
										<button className="icon-btn" type="button" disabled={busy === p.id} onClick={() => act('remove', p.id)}>Cancel</button>
									</div>
								))}
							</div>
						</>}
					</>
				)}
				<ErrorBanner>{error}</ErrorBanner>
			</main>
			{open && (
				<div className="sheet-backdrop" onClick={() => setOpen(null)}>
					<div className="sheet" role="dialog" aria-modal="true" aria-label={open.username} onClick={e => e.stopPropagation()}>
						<div className="grabber" />
						<div className="stats-head">
							<img className="avatar" src={avatar(open.photo)} alt="" />
							<div><div className="name">{open.username}</div><div className="sub">{seen(open)}</div></div>
						</div>
						<p className="hint">To play together, host a table and tap <b>Invite friends</b> in the waiting room.</p>
						<button className="btn btn-danger" type="button" disabled={busy === open.id} onClick={() => { if (confirm(`Remove ${open.username} from your friends?`)) act('remove', open.id); }}>Remove Friend</button>
						<button className="btn btn-plain" type="button" onClick={() => setOpen(null)}>Close</button>
					</div>
				</div>
			)}
			<TabBar />
		</div>
	);
}
