'use client';
// Browser side of phone alerts: ask permission, subscribe this phone, tell the server.
import { api } from './client';

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export type PushState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyBytes(base64: string): Uint8Array {
	const pad = '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
	if (typeof window === 'undefined' || !KEY) return 'unsupported';
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
		return isIos() && !standalone() ? 'ios-install' : 'unsupported';
	}
	if (Notification.permission === 'denied') return 'blocked';
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Must be called from a tap (browsers only ask for permission after a user gesture). */
export async function enablePush(): Promise<PushState> {
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
	const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
	await navigator.serviceWorker.ready;
	const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource }));
	await api('/api/push', { subscription: sub.toJSON() });
	return 'on';
}

export async function disablePush(): Promise<PushState> {
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) { await api('/api/push', { remove: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
	return 'off';
}
