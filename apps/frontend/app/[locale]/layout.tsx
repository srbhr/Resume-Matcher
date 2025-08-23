import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../messages/en.json';
import deMessages from '../../messages/de.json';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';
import ServiceWorkerRegistrar from '@/components/common/sw-registrar';
const locales = ['en', 'de'];
import type { Metadata } from 'next';

interface LayoutParams { params: { locale: string } }

export function generateMetadata({ params: { locale } }: LayoutParams): Metadata {
  const loc = locales.includes(locale) ? locale : 'en';
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://example.com';
  const basePath = `/${loc}`;
  const canonical = `${site}${basePath}`;
  const metaByLocale: Record<string, { title: string; description: string }> = {
    en: { title: 'Resume Matcher', description: 'Optimize your resume' },
    de: { title: 'Resume Matcher', description: 'Optimiere deinen Lebenslauf' }
  };
  const meta = metaByLocale[loc] || metaByLocale.en;
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical,
      languages: Object.fromEntries(locales.map((l: string) => [l, `${site}/${l}`]))
    },
    openGraph: {
      url: canonical,
      title: meta.title,
      description: meta.description,
      siteName: 'Resume Matcher',
      locale: loc,
      type: 'website'
    },
    twitter: {
      card: 'summary',
      title: meta.title,
      description: meta.description
    }
  };
}

export default function LocaleLayout({ children, params }: { children: ReactNode; params: { locale: string } }) {
  const loc = locales.includes(params.locale) ? params.locale : 'en';
  const messages = loc === 'de' ? deMessages : enMessages;
  return (
    <NextIntlClientProvider messages={messages} locale={loc} timeZone="UTC">
      <ResumePreviewProvider>
        <ServiceWorkerRegistrar />
        <div className="p-4 flex justify-end"><LanguageSwitcher /></div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Resume Matcher",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Any",
            description: loc === 'de' ? 'Optimiere deinen Lebenslauf für ATS und Job Keywords.' : 'Optimize your resume for ATS and job keywords.',
            url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com') + '/' + loc,
            inLanguage: loc,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
          }) }}
        />
        {children}
      </ResumePreviewProvider>
    </NextIntlClientProvider>
  );
}
