import type { NextConfig } from 'next';
import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

// Register next-intl config so the runtime can resolve it in lambdas/edge
const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
	webpack: (config) => {
		config.resolve.alias = {
			...(config.resolve.alias ?? {}),
			'@': path.resolve(__dirname),
		};
		return config;
	},
	async rewrites() {
		// Default to Render backend URL in production if no env is set; keep localhost in dev
		const defaultBackend = process.env.NODE_ENV === 'development'
			? 'http://localhost:8000'
			: 'https://resume-matcher-backend-j06k.onrender.com';
		const backend = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || defaultBackend;
		return [
			{
				source: '/api_be/:path*',
				destination: `${backend}/:path*`,
			},
		];
	},
};

export default withNextIntl(nextConfig);

