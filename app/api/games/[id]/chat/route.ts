import { after } from 'next/server';
import { body, json, withUser } from '@/lib/http';
import { listMessages, postMessage } from '@/lib/chat';
import { notifyGame } from '@/lib/realtime';
import { sql } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const afterId = Number(new URL(req.url).searchParams.get('after')) || 0;
	return json({ messages: await listMessages(user, Number(id), afterId) });
});

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
	const { id } = await ctx.params;
	const b = await body<{ text: string }>(req);
	const msg = await postMessage(user, Number(id), b.text);
	// ping the table so other phones fetch the new message right away
	after(async () => {
		const [g] = await sql<{ version: number }[]>`select version from games where id = ${Number(id)}`;
		if (g) await notifyGame(Number(id), g.version);
	});
	return json({ message: msg });
});
