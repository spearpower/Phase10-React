import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, readSession } from './lib/session';

const PUBLIC_PAGES = ['/signin', '/signup', '/offline'];

export async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;
	const session = await readSession(req.cookies.get(COOKIE)?.value);
	const isPublic = PUBLIC_PAGES.includes(pathname);
	if (!session && !isPublic) {
		const url = req.nextUrl.clone();
		url.pathname = '/signin';
		url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
		return NextResponse.redirect(url);
	}
	// After an admin password reset: choose a new password before anything else
	if (session?.mustChange && pathname !== '/new-password') {
		const url = req.nextUrl.clone();
		url.pathname = '/new-password';
		url.search = '';
		return NextResponse.redirect(url);
	}
	if (session && !session.mustChange && pathname === '/new-password') {
		const url = req.nextUrl.clone();
		url.pathname = '/';
		url.search = '';
		return NextResponse.redirect(url);
	}
	if (session && (pathname === '/signin' || pathname === '/signup')) {
		const url = req.nextUrl.clone();
		url.pathname = '/';
		url.search = '';
		return NextResponse.redirect(url);
	}
	return NextResponse.next();
}

// Pages only: API routes check the session themselves; static files are public.
export const config = {
	matcher: ['/((?!api|_next/static|_next/image|cards|avatars|icons|sounds|sw.js|manifest.webmanifest|offline.html|favicon.ico).*)'],
};
