import { body, fail, json, withUser } from '@/lib/http';
import { pushConfigured, removeSubscription, saveSubscription } from '@/lib/push';

// POST { subscription } saves this phone; POST { remove: endpoint } forgets it. GET says if alerts are available.
export const GET = withUser(async () => json({ available: pushConfigured() }));

export const POST = withUser(async (user, req: Request) => {
	const b = await body<{ subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; remove: string }>(req);
	if (b.remove) { await removeSubscription(user.id, String(b.remove)); return json({ ok: true }); }
	try { await saveSubscription(user.id, b.subscription || {}); } catch { return fail('That alert subscription isn’t valid'); }
	return json({ ok: true });
});
