import { json, withUser } from '@/lib/http';
import { invitable } from '@/lib/friends';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req: Request, ctx: Ctx) => json({ friends: await invitable(user, Number((await ctx.params).id)) }));
