import type { Metadata, Viewport } from 'next';
import {
  Lato,
  Noto_Sans_JP,
  Noto_Sans_KR,
  Noto_Sans_SC,
  Raleway,
  Space_Grotesk,
} from 'next/font/google';
import { THEME_COLOR } from '@/lib/theme-color';
import './(default)/css/globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

// Lato for the Deedy resume templates. Self-hosted at build time like the other
// faces. Lato is a static family, so each weight/style is its own file; `preload: false`
// keeps those files off every page, since only resumes in those templates use them.
// Deedy draws the first name in Hairline (100).
const lato = Lato({
  variable: '--font-lato',
  weight: ['100', '300', '400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
});

// Raleway for the Deedy template's contact lines, roles and dates. A variable font,
// so one file covers every weight.
const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
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

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className="h-full" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${lato.variable} ${raleway.variable} ${notoSansSC.variable} ${notoSansKR.variable} ${notoSansJP.variable} antialiased bg-canvas text-ink-soft min-h-full`}
      >
        {children}
      </body>
    </html>
  );
}
