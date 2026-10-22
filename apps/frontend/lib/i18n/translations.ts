'use client';

import { useMemo, useCallback } from 'react';
import { useLanguage } from '@/lib/context/language-context';
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
  const messages = useMemo(() => getMessagesForLocale(uiLanguage), [uiLanguage]);

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

export type { Messages };
