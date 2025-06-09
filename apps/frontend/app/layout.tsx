import type { Metadata, Viewport } from 'next';
import { Geist, Space_Grotesk } from 'next/font/google';
import { Suspense } from 'react';
import './(default)/css/globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
});

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'monospace'],
});

export const metadata: Metadata = {
  title: {
    template: '%s | Resume Matcher',
    default: 'Resume Matcher - AI-Powered Resume Analysis',
  },
  description: 'Build and optimize your resume with AI-powered Resume Matcher. Get intelligent feedback and improve your job application success rate.',
  applicationName: 'Resume Matcher',
  keywords: ['resume', 'matcher', 'job', 'application', 'AI', 'career', 'optimization'],
  authors: [{ name: 'Resume Matcher Team' }],
  creator: 'Resume Matcher',
  publisher: 'Resume Matcher',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Resume Matcher - AI-Powered Resume Analysis',
    description: 'Build and optimize your resume with AI-powered Resume Matcher',
    siteName: 'Resume Matcher',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Resume Matcher - AI-Powered Resume Analysis',
    description: 'Build and optimize your resume with AI-powered Resume Matcher',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

// Performance optimization: Component for development-only features
function DevTools() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  // Dynamically import memory monitor only in development
  import('@/lib/memory-monitor').then(({ useMemoryMonitor }) => {
    useMemoryMonitor('RootLayout');
  });

  return null;
}

// Loading component for Suspense fallback
function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className={`${geist.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Preload critical resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* DNS prefetch for external resources */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />

        {/* Resource hints for better performance */}
        <link rel="preload" href="/favicon.ico" as="image" type="image/x-icon" />

        {/* Security headers via meta tags */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="SAMEORIGIN" />
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />

        {/* PWA meta tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Resume Matcher" />
      </head>
      <body className="antialiased bg-white text-gray-900 min-h-screen">
        {/* Development tools */}
        <DevTools />

        {/* Main content with error boundary via Suspense */}
        <Suspense fallback={<Loading />}>
          <main className="relative">
            {children}
          </main>
        </Suspense>

        {/* Performance monitoring script for development */}
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (typeof window !== 'undefined' && 'performance' in window) {
                  window.addEventListener('load', () => {
                    setTimeout(() => {
                      const navTiming = performance.getEntriesByType('navigation')[0];
                      console.log('🚀 Page Load Performance:', {
                        'Load Time': Math.round(navTiming.loadEventEnd - navTiming.loadEventStart) + 'ms',
                        'DOM Ready': Math.round(navTiming.domContentLoadedEventEnd - navTiming.loadEventStart) + 'ms',
                        'First Paint': Math.round(performance.getEntriesByType('paint')[0]?.startTime || 0) + 'ms'
                      });
                    }, 100);
                  });
                }
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}
