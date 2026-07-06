/**
 * Internationalization configuration
 */

export const locales = ['en', 'es', 'fr', 'zh', 'ja', 'pt'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  zh: '中文',
  ja: '日本語',
  pt: 'Português',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  fr: '🇫🇷',
  zh: '🇨🇳',
  ja: '🇯🇵',
  pt: '🇧🇷',
};
