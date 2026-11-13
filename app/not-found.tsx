import Link from 'next/link';

export default function NotFound() {
	return (
		<div className="app centered">
			<main className="center">
				<div className="brand">
					<img src="/icons/icon-192.png" alt="" />
					<h1 className="large-title">Page not found</h1>
				</div>
				<p className="subtitle">That page doesn’t exist. Head back to the table.</p>
				<Link className="btn btn-primary" href="/">Go to Play</Link>
			</main>
		</div>
	);
}
