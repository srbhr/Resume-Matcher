import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    return [
      {
        source: '/api_be/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
