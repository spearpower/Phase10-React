import { json, withUser } from '@/lib/http';
import { voicePass } from '@/lib/voice';

type Ctx = { params: Promise<{ id: string }> };

// POST: a voice pass for this table (seated players only)
export const POST = withUser(async (user, _req: Request, ctx: Ctx) => json(await voicePass(user, Number((await ctx.params).id))));
