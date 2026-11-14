'use client';
// "Your turn" chime (public/sounds/turn.wav, made by tools/gen_ding.py).
// Phones only allow sound after the person has tapped once, so the first tap anywhere unlocks it.
const KEY = 'rummy10.sound';
let audio: HTMLAudioElement | null = null;
let armed = false;

export function soundOn(): boolean {
	try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSoundOn(on: boolean) {
	try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked: stays on for this visit */ }
	if (on) playTurnSound(true);
}

/** Call once on pages that may ding (the game board). */
export function initSound() {
	if (typeof window === 'undefined' || audio) return;
	audio = new Audio('/sounds/turn.wav');
	audio.preload = 'auto';
	audio.volume = 0.8;
	if (armed) return;
	armed = true;
	const unlock = () => {
		if (!audio) return;
		audio.muted = true;
		audio.play().then(() => { audio!.pause(); audio!.currentTime = 0; audio!.muted = false; }).catch(() => { audio!.muted = false; });
		window.removeEventListener('pointerdown', unlock);
		window.removeEventListener('keydown', unlock);
	};
	window.addEventListener('pointerdown', unlock, { once: true });
	window.addEventListener('keydown', unlock, { once: true });
}

export function playTurnSound(force = false) {
	if (!audio || (!force && !soundOn())) return;
	try { audio.currentTime = 0; audio.play().catch(() => { /* not unlocked yet */ }); } catch { /* ignore */ }
}
