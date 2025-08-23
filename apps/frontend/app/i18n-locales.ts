export const locales = ['en', 'de'] as const;
export const defaultLocale = 'en';
export type Locale = typeof locales[number];
