import type { NextConfig } from 'next';

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    // Note: Next.js serves filesystem routes (app/api/) before rewrites.
    // Do not create app/api/ routes or they will shadow the backend proxy.
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
