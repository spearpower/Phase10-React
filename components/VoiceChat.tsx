'use client';
// Table voice chat (LiveKit). Nobody is heard unless they tap the mic and allow it.
// The LiveKit library is only downloaded when someone joins. Speaking rings are drawn on the
// player boxes ([data-seat]) directly, so the board doesn't re-render while people talk.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, haptic } from '@/lib/client';
import type { Room } from 'livekit-client';

type Phase = 'off' | 'joining' | 'on' | 'error';

export default function VoiceChat({ gameId, enabled }: { gameId: number; enabled: boolean }) {
	const [phase, setPhase] = useState<Phase>('off');
	const [muted, setMuted] = useState(false);
	const [count, setCount] = useState(0);
	const [error, setError] = useState('');
	const room = useRef<Room | null>(null);
	const audioBox = useRef<HTMLDivElement>(null);

	const paint = useCallback((speaking: Set<string>, inVoice: Set<string>) => {
		document.querySelectorAll<HTMLElement>('[data-seat]').forEach(el => {
			el.classList.toggle('speaking', speaking.has(el.dataset.seat || ''));
			el.classList.toggle('in-voice', inVoice.has(el.dataset.seat || ''));
		});
	}, []);

	const leave = useCallback(async () => {
		const r = room.current;
		room.current = null;
		if (r) { try { await r.disconnect(); } catch { /* already gone */ } }
		if (audioBox.current) audioBox.current.innerHTML = '';
		paint(new Set(), new Set());
		setPhase('off'); setCount(0); setMuted(false);
	}, [paint]);

	useEffect(() => () => { void leave(); }, [leave]);
	useEffect(() => { if (!enabled && room.current) void leave(); }, [enabled, leave]);

	async function join() {
		setPhase('joining'); setError(''); haptic(10);
		try {
			const [{ url, token }, lk] = await Promise.all([
				api<{ url: string; token: string }>(`/api/games/${gameId}/voice`, {}),
				import('livekit-client'),
			]);
			const r = new lk.Room({ adaptiveStream: false, dynacast: false, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
			const members = () => new Set([r.localParticipant.identity, ...Array.from(r.remoteParticipants.values()).map(p => p.identity)]);
			const refresh = () => { setCount(r.remoteParticipants.size + 1); paint(new Set(r.activeSpeakers.map(p => p.identity)), members()); };
			r.on(lk.RoomEvent.TrackSubscribed, track => {
				if (track.kind !== lk.Track.Kind.Audio || !audioBox.current) return;
				const el = track.attach();
				el.setAttribute('playsinline', 'true');
				audioBox.current.appendChild(el);
			});
			r.on(lk.RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(el => el.remove()); });
			r.on(lk.RoomEvent.ActiveSpeakersChanged, refresh);
			r.on(lk.RoomEvent.ParticipantConnected, refresh);
			r.on(lk.RoomEvent.ParticipantDisconnected, refresh);
			r.on(lk.RoomEvent.Disconnected, () => { if (room.current === r) void leave(); });
			await r.connect(url, token);
			room.current = r;
			await r.startAudio(); // allowed: we're inside the tap
			await r.localParticipant.setMicrophoneEnabled(true);
			setPhase('on'); refresh();
		} catch (e) {
			const msg = (e as Error).message || '';
			setError(/permission|denied|notallowed/i.test(msg) ? 'Microphone access was blocked. Allow it in your browser settings to talk.' : msg || 'Couldn’t join voice chat');
			setPhase('error');
			await leave();
			setPhase('error');
		}
	}

	async function toggleMute() {
		const r = room.current;
		if (!r) return;
		const next = !muted;
		await r.localParticipant.setMicrophoneEnabled(!next);
		setMuted(next); haptic(8);
	}

	if (!enabled) return null;
	return (
		<>
			<div ref={audioBox} hidden aria-hidden="true" />
			{phase === 'on' ? (
				<div className="voice-pill" role="group" aria-label="Voice chat">
					<span className="dot" aria-hidden="true" />
					<span className="lbl">Voice · {count}</span>
					<button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? '🔇' : '🎙'}</button>
					<button type="button" onClick={() => void leave()} aria-label="Leave voice chat">✕</button>
				</div>
			) : (
				<button type="button" className={`voice-fab${phase === 'joining' ? ' busy' : ''}`} onClick={join} disabled={phase === 'joining'}
					aria-label={phase === 'joining' ? 'Joining voice chat…' : 'Join voice chat'}>
					{phase === 'joining' ? '…' : '🎙'}
				</button>
			)}
			{phase === 'error' && error && <div className="voice-error" role="alert" onClick={() => setPhase('off')}>{error}</div>}
		</>
	);
}
