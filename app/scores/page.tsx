'use client';
import { useEffect, useState } from 'react';
import { api, avatar } from '@/lib/client';
import { ErrorBanner, NavBar, Skeleton, TabBar } from '@/components/ui';

interface Row { id: number; username: string; photo: string; points: number; games: number }

export default function ScoresPage() {
	const [rows, setRows] = useState<Row[] | null>(null);
	const [error, setError] = useState('');
	const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Kampala' }).format(new Date());

	useEffect(() => {
		const load = () => api<{ rows: Row[] }>('/api/scores').then(d => setRows(d.rows)).catch(e => setError(e.message));
		load();
		const t = setInterval(load, 60000);
		return () => clearInterval(t);
	}, []);

	return (
		<div className="app has-tabs">
			<NavBar />
			<main>
				<h1 className="large-title">Scores</h1>
				<p className="subtitle">{month}</p>
				{rows === null ? <Skeleton rows={4} label="Loading leaderboard" /> : rows.length === 0 ? (
					<div className="empty"><strong>No points yet this month</strong>Finish a game to get on the board.</div>
				) : (
					<div className="list">
						{rows.map((r, i) => (
							<div key={r.id} className="list-row">
								<span className="rank">{i + 1}</span>
								<img className="av" src={avatar(r.photo)} alt="" />
								<span className="main"><span className="title">{r.username}</span><span className="sub">{r.games} {r.games === 1 ? 'game' : 'games'}</span></span>
								<span className="meta"><b>{r.points}</b> pts</span>
							</div>
						))}
					</div>
				)}
				<ErrorBanner>{error}</ErrorBanner>
			</main>
			<TabBar />
		</div>
	);
}
