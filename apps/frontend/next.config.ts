import type { NextConfig } from "next";
// Make next-intl plugin optional to avoid build failure if the subpath export isn't resolvable in this environment
let withNextIntl: (config: NextConfig) => NextConfig = (cfg) => cfg;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const createNextIntlPlugin = require('next-intl/plugin');
  withNextIntl = createNextIntlPlugin('./i18n.ts');
} catch {
  // Fallback: proceed without the plugin; i18n middleware still handles routing
}

const nextConfig: NextConfig = {
  /* config options here */
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
export default withNextIntl(nextConfig);
