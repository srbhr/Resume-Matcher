'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Locale } from '@/i18n/config';
import en from '@/messages/en.json';
import type { Messages } from './messages';

/**
 * UI messages in the browser. English ships with the page; every other
 * language is its own chunk, fetched when it's picked. Bundling all seven cost
 * about 135 KB gzip on every route. Typing each loader as `Messages` keeps the
 * build-time check that every locale file has en.json's shape. The full,
 * synchronous table in `./messages` is for the server (print pages) and tests.
 */
export const MESSAGE_LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Messages>> = {
  es: () => import('@/messages/es.json').then((module) => module.default),
  zh: () => import('@/messages/zh.json').then((module) => module.default),
  ja: () => import('@/messages/ja.json').then((module) => module.default),
  pt: () => import('@/messages/pt-BR.json').then((module) => module.default),
  fr: () => import('@/messages/fr.json').then((module) => module.default),
  ko: () => import('@/messages/ko.json').then((module) => module.default),
};

const loaded = new Map<Locale, Messages>([['en', en]]);
const inFlight = new Set<Locale>();
const listeners = new Set<() => void>();

function load(locale: Locale): void {
  if (loaded.has(locale) || inFlight.has(locale) || !(locale in MESSAGE_LOADERS)) return;
  inFlight.add(locale);
  MESSAGE_LOADERS[locale as Exclude<Locale, 'en'>]()
    .then((messages) => {
      loaded.set(locale, messages);
      listeners.forEach((notify) => notify());
    })
    .catch((error: unknown) => {
      // Stays in English; the next render of a translated component retries.
      console.warn(`Could not load the ${locale} UI messages:`, error);
    })
    .finally(() => inFlight.delete(locale));
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The messages for `locale`: English until they have loaded, or if the locale is unknown. */
export function useLocaleMessages(locale: Locale): Messages {
  const read = () => loaded.get(locale) ?? en;
  const messages = useSyncExternalStore(subscribe, read, () => en);
  useEffect(() => load(locale), [locale]);
  return messages;
}
