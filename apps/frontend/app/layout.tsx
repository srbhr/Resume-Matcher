import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { locales, defaultLocale } from '../i18n';
import { ClerkProvider } from '@clerk/nextjs';

const _spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap'
});

const _geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Resume Matcher',
  description: 'Build your resume with Resume Matcher',
  applicationName: 'Resume Matcher',
  keywords: ['resume', 'matcher', 'job', 'application']
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side derive locale: prefer first path segment if valid, else Accept-Language, fallback default.
  // Next.js headers() returns a ReadonlyHeaders immediately; type confusion workaround with generics
  const h = headers() as unknown as Headers;
  const pathname = h.get('x-invoke-path') || h.get('referer') || '/';
  const seg = pathname.split('/').filter(Boolean)[0];
  const localeList: readonly string[] = locales as readonly string[];
  let activeLocale: string | undefined = localeList.includes(seg) ? seg : undefined;
  if (!activeLocale) {
  const accept = h.get('accept-language');
    if (accept) {
      const preferred = accept.split(',').map((p: string) => p.split(';')[0].trim());
  activeLocale = preferred.find((p: string) => localeList.includes(p));
    }
  }
  if (!activeLocale) activeLocale = defaultLocale;
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const app = (
    <html lang={activeLocale} className="dark h-full" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="h-full antialiased bg-zinc-950 text-white font-sans">{children}</body>
    </html>
  );
  if (!pk) return app;
  return (
    <ClerkProvider publishableKey={pk}>{app}</ClerkProvider>
  );
}
