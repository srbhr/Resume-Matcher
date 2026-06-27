import type { Locale } from '@/i18n/config';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import ja from '@/messages/ja.json';
import pt from '@/messages/pt-BR.json';
import fr from '@/messages/fr.json';

export type Messages = typeof en;

const allMessages: Record<Locale, Messages> = {
  en,
  es,
  zh,
  ja,
  pt,
  fr,
};

export function getMessages(locale: Locale): Messages {
  return allMessages[locale] || allMessages.en;
}
