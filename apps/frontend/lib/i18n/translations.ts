'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/context/language-context';
import type { Locale } from '@/i18n/config';

// Import all message files statically for client-side use
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import ja from '@/messages/ja.json';

// Type for the messages structure
export type Messages = typeof en;

// All messages indexed by locale
const allMessages: Record<Locale, Messages> = {
  en,
  es,
  zh,
  ja,
};

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue(obj, "common.save") returns obj.common.save
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      // Return the key itself if not found (fallback)
      return path;
    }
  }

  return typeof result === 'string' ? result : path;
}

/**
 * Hook to get translations for the current UI language
 *
 * Usage:
 * const { t } = useTranslations();
 * <button>{t('common.save')}</button>
 */
export function useTranslations() {
  const { uiLanguage } = useLanguage();
  const [messages, setMessages] = useState<Messages>(allMessages[uiLanguage] || allMessages.en);

  useEffect(() => {
    setMessages(allMessages[uiLanguage] || allMessages.en);
  }, [uiLanguage]);

  /**
   * Translate a key to the current language
   * Supports dot notation for nested keys: t('common.save')
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let translation = getNestedValue(messages as unknown as Record<string, unknown>, key);

      // Replace parameters like {name} with actual values
      if (params) {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
          translation = translation.replace(
            new RegExp(`\\{${paramKey}\\}`, 'g'),
            String(paramValue)
          );
        });
      }

      return translation;
    },
    [messages]
  );

  return { t, messages, locale: uiLanguage };
}

/**
 * Get messages for a specific locale (for server components)
 */
export function getMessages(locale: Locale): Messages {
  return allMessages[locale] || allMessages.en;
}

/**
 * Translate a key for a specific locale (for server components)
 */
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
