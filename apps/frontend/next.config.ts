import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
	webpack: (config) => {
		config.resolve.alias = {
			...(config.resolve.alias ?? {}),
			'@': path.resolve(__dirname),
		};
		return config;
	},
	async rewrites() {
		const backend = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
		return [
			{
				source: '/api_be/:path*',
				destination: `${backend}/:path*`,
			},
		];
	},
};

export default nextConfig;

