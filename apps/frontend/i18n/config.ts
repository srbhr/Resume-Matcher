/**
 * Internationalization configuration
 *
 * Currently English-only. To add a new language:
 * 1. Add locale code to the `locales` array below
 * 2. Add display name to `localeNames` and flag to `localeFlags`
 * 3. Create a messages/<code>.json translation file
 * 4. Import it in lib/i18n/messages.ts
 * 5. Update backend SUPPORTED_LANGUAGES in apps/backend/app/routers/config.py
 */

export const locales = ['en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
};
