'use client';
import { useMemo } from 'react';

export function Crown({ size = 18, title }: { size?: number; title?: string }) {
	return (
		<svg className="crown" width={size} height={size} viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
			<path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5L3 8.5Z" fill="#F2C14E" stroke="#8A6512" strokeWidth="1.2" strokeLinejoin="round" />
			<rect x="5" y="18.6" width="14" height="2.4" rx="1" fill="#F2C14E" stroke="#8A6512" strokeWidth="1" />
			<circle cx="12" cy="4.6" r="1.4" fill="#FFF3C4" /><circle cx="3" cy="8" r="1.2" fill="#FFF3C4" /><circle cx="21" cy="8" r="1.2" fill="#FFF3C4" />
		</svg>
	);
}

/** Falling confetti in the four card colours. Pure CSS animation; hidden when reduced motion is on. */
export function Confetti({ big }: { big: boolean }) {
	const pieces = useMemo(() => Array.from({ length: big ? 90 : 40 }, (_, i) => ({
		left: Math.random() * 100,
		delay: Math.random() * (big ? 1.2 : 0.6),
		dur: 1.8 + Math.random() * (big ? 1.8 : 1),
		rot: Math.random() * 360,
		color: ['#D7263D', '#2457C5', '#F0B21C', '#178A4C', '#F2C14E', '#F6F3EA'][i % 6],
		w: 6 + Math.random() * 6,
	})), [big]);
	return (
		<div className="confetti" aria-hidden="true">
			{pieces.map((p, i) => (
				<i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, width: p.w, height: p.w * 0.45, transform: `rotate(${p.rot}deg)` }} />
			))}
		</div>
	);
}

export type BubbleKind = 'turn' | 'phase' | 'discard' | 'round' | 'win' | 'skip' | 'info';
export interface Bubble { id: number; text: string; kind: BubbleKind }

/** Stacked notification bubbles in the middle of the table. Announced to screen readers. */
export function Bubbles({ items, allTop = false }: { items: Bubble[]; allTop?: boolean }) {
	// Big moments in the middle of the table; small notices slide in at the top like phone notifications
	// (at game end everything goes to the top so the standings stay readable)
	const big = (k: BubbleKind) => !allTop && (k === 'turn' || k === 'round' || k === 'win');
	return (
		<>
			<BubbleStack items={items.filter(b => !big(b.kind))} where="top" />
			<BubbleStack items={items.filter(b => big(b.kind))} where="center" />
		</>
	);
}

function BubbleStack({ items, where }: { items: Bubble[]; where: 'top' | 'center' }) {
	return (
		<div className={`bubbles ${where}`} role="status" aria-live="polite">
			{items.map(b => (
				<div key={b.id} className={`bubble ${b.kind}`}>
					{(b.kind === 'win' || b.kind === 'round') && <Crown size={b.kind === 'win' ? 26 : 20} />}
					<span>{b.text}</span>
				</div>
			))}
		</div>
	);
}
