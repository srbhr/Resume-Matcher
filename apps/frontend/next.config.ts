import type { NextConfig } from 'next';

const BACKEND_ORIGIN = 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
      {
        source: '/docs',
        destination: `${BACKEND_ORIGIN}/docs`,
      },
      {
        source: '/redoc',
        destination: `${BACKEND_ORIGIN}/redoc`,
      },
      {
        source: '/openapi.json',
        destination: `${BACKEND_ORIGIN}/openapi.json`,
      },
    ];
  },
};

export default nextConfig;
