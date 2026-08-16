import type { Metadata } from 'next';
import { Geist, Noto_Sans_JP, Noto_Sans_KR, Noto_Sans_SC, Space_Grotesk } from 'next/font/google';
import './(default)/css/globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
});

// CJK fallbacks for Chinese/Japanese/Korean resume content.
//
// `preload: false` because the CJK unicode-ranges are not preloadable anyway
// (Google exposes no `chinese-simplified` subset to next/font) and we don't
// want to ship a large font to users who never render CJK. Turbopack already
// skips preloading these, but the legacy webpack font path errors on a
// preloaded font declared without `subsets`, so this keeps both building.
//
// No `weight` array: Google serves these as variable fonts, so listing four
// weights emitted four identical @font-face blocks per unicode subset — 405
// rules and 372 KB of render-blocking CSS for one face, ~4x duplication.
//
// All three regional faces are loaded because Noto Sans SC covers only 0.7% of
// Hangul (Korean rendered as tofu) while covering ~93% of kana (hijacking
// Japanese with Simplified-Chinese glyph forms). The per-locale ordering lives
// in lib/types/template-settings.ts.
const notoSansSC = Noto_Sans_SC({
  variable: '--font-noto-sans-sc',
  display: 'swap',
  preload: false,
});

const notoSansKR = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  display: 'swap',
  preload: false,
});

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Resume Matcher',
  description: 'Build your resume with Resume Matcher',
  applicationName: 'Resume Matcher',
  keywords: ['resume', 'matcher', 'job', 'application'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className="h-full" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${spaceGrotesk.variable} ${notoSansSC.variable} ${notoSansKR.variable} ${notoSansJP.variable} antialiased bg-background text-ink-soft min-h-full`}
      >
        {children}
      </body>
    </html>
  );
}
