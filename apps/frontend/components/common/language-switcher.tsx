"use client";
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {locales} from '@/i18n';

export function LanguageSwitcher() {
  const pathname = usePathname();
  const t = useTranslations('Language');
  // pathname like /en/... or /de/...
  // Build same path with other locale
  return (
    <div className="flex gap-2 text-xs items-center">
      <span className="opacity-70">{t('switch')}:</span>
  {locales.map((l: string) => {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length === 0) return null;
        parts[0] = l; // replace locale segment
        const target = '/' + parts.join('/');
        const active = pathname.startsWith('/'+l);
        const label = t.has(l) ? t(l) : l;
        return (
          <Link key={l} href={target} prefetch={false} onClick={() => {
            try { document.cookie = `locale=${l};path=/;max-age=31536000`; } catch {}
          }} className={"px-2 py-1 rounded border text-white/80 hover:text-white hover:border-white/50 transition " + (active ? 'border-white/70 bg-white/10' : 'border-white/20')}>{label}</Link>
        );
      })}
    </div>
  );
}
