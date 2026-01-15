import type { Locale } from '@/i18n/config';
import { getMessages as getMessagesForLocale } from './messages';
import { applyParams, getNestedValue } from './utils';

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const messages = getMessagesForLocale(locale);
  const translation = getNestedValue(messages as unknown as Record<string, unknown>, key);
  return applyParams(translation, params);
}
