import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/http';
import { NavBar, TabBar, Chevron } from '@/components/ui';
import SignOutButton from '@/components/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function PlayPage() {
	const user = await currentUser();
	if (!user) redirect('/signin');
	return (
		<div className="app has-tabs">
			<NavBar trailing={<SignOutButton />} />
			<main>
				<h1 className="large-title">Play</h1>
				<p className="subtitle">Get 2–6 friends together and race through the 10 phases.</p>

				<section className="profile" aria-label="Signed in player">
					<img className="avatar" src={`/avatars/${user.photo}`} alt="" />
					<div className="who">
						<div className="hello">Signed in as</div>
						<div className="name">{user.username}</div>
					</div>
				</section>

				<Link href="/host" className="btn btn-primary">
					<svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					Host a Game
				</Link>

				<div className="section-title">Join</div>
				<nav className="group" aria-label="Join or continue">
					<Link className="row-link" href="/join">
						<span className="row-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 8v6M14 11h6" /></svg></span>
						<span className="row-text"><span className="row-title">Join a Game</span><span className="row-sub">Open tables, or enter a PIN</span></span>
						<Chevron />
					</Link>
					<Link className="row-link" href="/continue">
						<span className="row-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4v4h4" /><path d="M12 8v4l3 2" /></svg></span>
						<span className="row-text"><span className="row-title">Continue a Game</span><span className="row-sub">Rejoin a game in progress</span></span>
						<Chevron />
					</Link>
				</nav>
			</main>
			<TabBar />
		</div>
	);
}
