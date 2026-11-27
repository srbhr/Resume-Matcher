/**
 * Every locale, statically: for the server (print pages, lib/i18n/server.ts) and
 * tests. Client code takes only the `Messages` type from here; it loads messages
 * through client-messages.ts, so other languages stay out of the shared chunk.
 */
import type { Locale } from '@/i18n/config';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import ja from '@/messages/ja.json';
import pt from '@/messages/pt-BR.json';
import fr from '@/messages/fr.json';
import ko from '@/messages/ko.json';

export type Messages = typeof en;

const allMessages: Record<Locale, Messages> = {
  en,
  es,
  zh,
  ja,
  pt,
  fr,
  ko,
};

export function getMessages(locale: Locale): Messages {
  return allMessages[locale] || allMessages.en;
}
