import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n';

// Base i18n middleware instance
const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always'
});

// Security headers (CSP hardened: no unsafe-inline/eval; support hashed/nonce scripts via runtime)
// Generate nonce using Web Crypto only (Edge runtime compatible)
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function buildCsp(nonce: string) {
  const defaultBackend = process.env.NODE_ENV === 'development'
    ? 'http://localhost:8000'
    : 'https://resume-matcher-backend-j06k.onrender.com';
  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || defaultBackend;
  // Always include the Render fallback to be safe if envs are missing
  const connectExtra = Array.from(new Set([apiOrigin, 'https://resume-matcher-backend-j06k.onrender.com'])).filter(Boolean);
  // Allow Next.js internal websocket endpoints for dev (/_next/) with wss: fallback
  const connectSrc = ["'self'", 'ws:', 'wss:', ...connectExtra];
  return [
    "default-src 'self'",
    // Allow scripts from self + nonce + Next.js dynamic chunks; no eval
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Styles may still need inline for Tailwind critical injection; keep 'unsafe-inline' until extracted CSS available
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' blob: data: https://raw.githubusercontent.com",
  // Allow Clerk APIs
  `connect-src ${connectSrc.join(' ')} https://*.clerk.com https://*.clerk.services`,
    "media-src 'self'",
    "object-src 'none'",
  "frame-ancestors 'self'",
  // Clerk embeds
  "frame-src 'self' https://*.clerk.com https://*.clerk.services",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    // Optional reporting endpoint placeholder
    // "report-uri /api/csp-report"
  ].join('; ');
}

const permissionsPolicy: Record<string,string> = {
  'camera': '()',
  'microphone': '()',
  'geolocation': '()'
};

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Skip i18n rewriting for Clerk auth routes
  const isAuthRoute = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');
  const response = isAuthRoute ? NextResponse.next() : intlMiddleware(request);

  // Generate a nonce per response (hex)
  const nonce = generateNonce();

  // Apply security headers only to HTML/document requests
  if (!pathname.startsWith('/_next')) {
    response.headers.set('Content-Security-Policy', buildCsp(nonce));
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-DNS-Prefetch-Control', 'off');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    response.headers.set('Permissions-Policy', Object.entries(permissionsPolicy).map(([k,v]) => `${k}=${v}`).join(', '));
    response.headers.set('X-Nonce', nonce); // expose for potential inline script components (can be removed later)
  }
  return response;
}

export const config = { matcher: ['/((?!_next|api|.*\\..*).*)'] };
