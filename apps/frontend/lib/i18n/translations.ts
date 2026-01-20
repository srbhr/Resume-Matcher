'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/context/language-context';
import type { Locale } from '@/i18n/config';
import { getMessages as getMessagesForLocale, type Messages } from './messages';
import { applyParams, getNestedValue } from './utils';

/**
 * Hook to get translations for the current UI language
 *
 * Usage:
 * const { t } = useTranslations();
 * <button>{t('common.save')}</button>
 */
export function useTranslations() {
  const { uiLanguage } = useLanguage();
  const [messages, setMessages] = useState<Messages>(getMessagesForLocale(uiLanguage));

  useEffect(() => {
    setMessages(getMessagesForLocale(uiLanguage));
  }, [uiLanguage]);

  /**
   * Translate a key to the current language
   * Supports dot notation for nested keys: t('common.save')
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const translation = getNestedValue(messages as unknown as Record<string, unknown>, key);
      return applyParams(translation, params);
    },
    [messages]
  );

  return { t, messages, locale: uiLanguage };
}

/**
 * Get messages for a specific locale (for server components)
 */
export const getMessages = getMessagesForLocale;

/**
 * Translate a key for a specific locale (for server components)
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const messages = getMessagesForLocale(locale);
  const translation = getNestedValue(messages as unknown as Record<string, unknown>, key);
  return applyParams(translation, params);
}

export type { Messages };
