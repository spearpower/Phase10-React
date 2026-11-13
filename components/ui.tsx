'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavBar({ title, back, backLabel = 'Back', trailing }: { title?: string; back?: string; backLabel?: string; trailing?: ReactNode }) {
	return (
		<header className="navbar">
			{back ? (
				<Link className="nav-back" href={back}>
					<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" /></svg>
					<span>{backLabel}</span>
				</Link>
			) : <span />}
			<h1 className="nav-title">{title || ''}</h1>
			<div className="nav-trailing">{trailing}</div>
		</header>
	);
}

export function TabBar() {
	const path = usePathname();
	const tabs = [
		{ href: '/', label: 'Play', icon: <><path d="M7 4h7a3 3 0 0 1 3 3v12a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M9 4 18.5 2.6a2 2 0 0 1 2.3 1.7l1.6 11" /></> },
		{ href: '/scores', label: 'Scores', icon: <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></> },
	];
	return (
		<nav className="tabbar" aria-label="Sections">
			{tabs.map(t => (
				<Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>
					<svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
					<span>{t.label}</span>
				</Link>
			))}
		</nav>
	);
}

export function Chevron() {
	return <svg className="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="m1 1 6 6-6 6" /></svg>;
}

export function Skeleton({ rows = 3, label }: { rows?: number; label: string }) {
	return <div className="skeleton" aria-label={label} role="status">{Array.from({ length: rows }, (_, i) => <div key={i} />)}</div>;
}

export function ErrorBanner({ children }: { children?: ReactNode }) {
	if (!children) return null;
	return <div className="error-banner" role="alert">{children}</div>;
}
