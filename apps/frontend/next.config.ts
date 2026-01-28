import type { NextConfig } from 'next';

// Backend URL for rewrites (internal Docker network or local dev)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: 'standalone',
  experimental: {
    // optimizePackageImports: ['...'],
  },
  async rewrites() {
    return [
      {
        // Proxy all /api/* requests to the backend
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
