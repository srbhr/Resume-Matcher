import type { Locale } from '@/i18n/config';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import ja from '@/messages/ja.json';

export type Messages = typeof en;

const allMessages: Record<Locale, Messages> = {
  en,
  es,
  zh,
  ja,
};

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }

  return typeof result === 'string' ? result : path;
}

export function getMessages(locale: Locale): Messages {
  return allMessages[locale] || allMessages.en;
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const messages = getMessages(locale);
  let translation = getNestedValue(messages as unknown as Record<string, unknown>, key);

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      translation = translation.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    });
  }

  return translation;
}
