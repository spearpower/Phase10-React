import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/http';

// Browser errors land here and are written to the server log (Vercel → Logs), with who and where.
export async function POST(req: Request) {
	const text = (await req.text().catch(() => '')).slice(0, 4000);
	let data: Record<string, unknown> = {};
	try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
	const user = await currentUser().catch(() => null);
	console.error('[client-error]', JSON.stringify({ user: user ? `${user.username}#${user.id}` : null, ...data }));
	return new NextResponse(null, { status: 204 });
}
