import { defaultLocale, locales, type Locale } from '@/i18n/config';

export function resolveLocale(value: string | undefined): Locale {
  if (value && locales.includes(value as Locale)) {
    return value as Locale;
  }
  return defaultLocale;
}
