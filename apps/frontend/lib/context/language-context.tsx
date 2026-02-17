'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchLanguageConfig,
  updateLanguageConfig,
  type SupportedLanguage,
} from '@/lib/api/config';
import { locales, defaultLocale, localeNames, type Locale } from '@/i18n/config';

const CONTENT_STORAGE_KEY = 'resume_matcher_content_language';
const UI_STORAGE_KEY = 'resume_matcher_ui_language';

interface LanguageContextValue {
  contentLanguage: SupportedLanguage;
  uiLanguage: Locale;
  isLoading: boolean;
  setContentLanguage: (lang: SupportedLanguage) => Promise<void>;
  setUiLanguage: (lang: Locale) => void;
  languageNames: typeof localeNames;
  supportedLanguages: readonly Locale[];
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [contentLanguage, setContentLanguageState] = useState<SupportedLanguage>(defaultLocale);
  const [uiLanguage, setUiLanguageState] = useState<Locale>(defaultLocale);
  const [isLoading, setIsLoading] = useState(true);

  // Load content language from backend on mount
  useEffect(() => {
    const loadLanguages = async () => {
      try {
        const config = await fetchLanguageConfig();
        if (config.content_language) {
          setContentLanguageState(config.content_language as SupportedLanguage);
          localStorage.setItem(CONTENT_STORAGE_KEY, config.content_language);
        }
      } catch (error) {
        console.error('Failed to load language config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguages();
  }, []);

  const setContentLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      const previousLang = contentLanguage;
      try {
        setContentLanguageState(lang);
        localStorage.setItem(CONTENT_STORAGE_KEY, lang);
        await updateLanguageConfig({ content_language: lang });
      } catch (error) {
        console.error('Failed to update content language:', error);
        setContentLanguageState(previousLang);
        localStorage.setItem(CONTENT_STORAGE_KEY, previousLang);
      }
    },
    [contentLanguage]
  );

  const setUiLanguage = useCallback((lang: Locale) => {
    setUiLanguageState(lang);
    localStorage.setItem(UI_STORAGE_KEY, lang);
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        contentLanguage,
        uiLanguage,
        isLoading,
        setContentLanguage,
        setUiLanguage,
        languageNames: localeNames,
        supportedLanguages: locales,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
