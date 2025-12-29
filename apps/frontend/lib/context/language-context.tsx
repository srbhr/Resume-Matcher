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

  // Load languages from localStorage first, then sync content language with backend
  useEffect(() => {
    const loadLanguages = async () => {
      try {
        // Load UI language from localStorage (client-side only)
        const cachedUiLang = localStorage.getItem(UI_STORAGE_KEY);
        if (cachedUiLang && locales.includes(cachedUiLang as Locale)) {
          setUiLanguageState(cachedUiLang as Locale);
        }

        // Try localStorage first for content language
        const cachedContentLang = localStorage.getItem(CONTENT_STORAGE_KEY);
        if (cachedContentLang && locales.includes(cachedContentLang as Locale)) {
          setContentLanguageState(cachedContentLang as SupportedLanguage);
        }

        // Then fetch content language from backend to ensure sync
        const config = await fetchLanguageConfig();
        if (config.content_language && locales.includes(config.content_language as Locale)) {
          setContentLanguageState(config.content_language);
          localStorage.setItem(CONTENT_STORAGE_KEY, config.content_language);
        }
      } catch (error) {
        console.error('Failed to load language config:', error);
        // Keep using cached/default values
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguages();
  }, []);

  const setContentLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      if (!locales.includes(lang as Locale)) {
        console.error(`Unsupported language: ${lang}`);
        return;
      }

      const previousLang = contentLanguage;
      try {
        // Optimistically update UI
        setContentLanguageState(lang);
        localStorage.setItem(CONTENT_STORAGE_KEY, lang);

        // Persist to backend
        await updateLanguageConfig({ content_language: lang });
      } catch (error) {
        console.error('Failed to update content language:', error);
        // Revert on error
        setContentLanguageState(previousLang);
        localStorage.setItem(CONTENT_STORAGE_KEY, previousLang);
      }
    },
    [contentLanguage]
  );

  const setUiLanguage = useCallback((lang: Locale) => {
    if (!locales.includes(lang)) {
      console.error(`Unsupported UI language: ${lang}`);
      return;
    }
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
