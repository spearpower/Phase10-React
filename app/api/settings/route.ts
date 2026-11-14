import { json, withUser } from '@/lib/http';
import { getSettings } from '@/lib/settings';

export const GET = withUser(async () => json(await getSettings()));
