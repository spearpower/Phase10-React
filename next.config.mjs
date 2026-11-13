/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	// postgres.js is a Node library: keep it out of the bundler
	serverExternalPackages: ['postgres'],
	async headers() {
		return [
			{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
			{ source: '/cards/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
			{ source: '/:path*', headers: [
				{ key: 'X-Content-Type-Options', value: 'nosniff' },
				{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
				{ key: 'X-Frame-Options', value: 'DENY' },
			] },
		];
	},
};

export default nextConfig;
