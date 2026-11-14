/* Rummy10 service worker (Next.js build).
 * - Cache-first for hashed build files (/_next/static) and the card/avatar/icon art.
 * - Never caches pages or /api: they carry the signed-in player and live game state.
 * - Navigations fall back to /offline.html when the network is down.
 * Bump VERSION when the precached files change.
 */
const VERSION = 'rummy10-v3.2.0';
const STATIC_CACHE = VERSION + '-static';

const CARDS = [];
['r', 'b', 'y', 'g'].forEach(c => { for (let n = 1; n <= 12; n++) CARDS.push('/cards/' + c + n + '.svg'); });
['ww', 'ss', 'back'].forEach(n => CARDS.push('/cards/' + n + '.svg'));

const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/sounds/turn.wav'].concat(CARDS);

self.addEventListener('install', event => {
	event.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(k => (k.startsWith('rummy10-') || k.startsWith('sofi10-')) && k !== STATIC_CACHE).map(k => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

const isStatic = url => url.pathname.startsWith('/_next/static/') || /^\/(cards|avatars|icons|sounds)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest';

self.addEventListener('fetch', event => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

	if (req.mode === 'navigate') {
		event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
		return;
	}
	if (isStatic(url)) {
		event.respondWith(
			caches.open(STATIC_CACHE).then(cache =>
				cache.match(req).then(hit => hit || fetch(req).then(res => {
					if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
					return res;
				}))
			)
		);
	}
});
