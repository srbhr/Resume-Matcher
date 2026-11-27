'use client';

import { Globe } from '@phosphor-icons/react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { Locale } from '@/i18n/config';
import type { SupportedLanguage } from '@/lib/api/config';
import { useLanguage } from '@/lib/context/language-context';
import { useTranslations } from '@/lib/i18n';

/** Settings' Language section: the interface language and the language the AI writes in. */
export function LanguageSettings() {
  const { t } = useTranslations();
  const {
    contentLanguage,
    uiLanguage,
    setContentLanguage,
    setUiLanguage,
    languageNames,
    supportedLanguages,
    isLoading: languageLoading,
  } = useLanguage();

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 border-b border-panel-hover pb-2">
        <Globe className="w-4 h-4" />
        <h2 className="font-serif text-xl font-bold text-ink text-balance">
          {t('settings.languageTitle')}
        </h2>
      </div>

      {/* UI Language */}
      <div className="space-y-4">
        <div>
          <h3
            id="ui-language-heading"
            className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft mb-2"
          >
            {t('settings.uiLanguage')}
          </h3>
          <p className="text-sm text-ink-soft mb-3">{t('settings.uiLanguageDescription')}</p>
        </div>

        <SegmentedControl
          aria-labelledby="ui-language-heading"
          className="grid grid-cols-2 md:grid-cols-4"
          items={supportedLanguages.map((lang) => ({
            value: lang,
            label: languageNames[lang],
            disabled: languageLoading,
          }))}
          value={uiLanguage}
          onChange={(lang) => setUiLanguage(lang as Locale)}
        />
      </div>

      {/* Content Language */}
      <div className="space-y-4 pt-4 border-t border-paper">
        <div>
          <h3
            id="content-language-heading"
            className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft mb-2"
          >
            {t('settings.contentLanguage')}
          </h3>
          <p className="text-sm text-ink-soft mb-3">{t('settings.contentLanguageDescription')}</p>
        </div>

        <SegmentedControl
          aria-labelledby="content-language-heading"
          className="grid grid-cols-2 md:grid-cols-4"
          items={supportedLanguages.map((lang) => ({
            value: lang,
            label: languageNames[lang],
            disabled: languageLoading,
          }))}
          value={contentLanguage}
          onChange={(lang) => setContentLanguage(lang as SupportedLanguage)}
        />
      </div>
    </section>
  );
}
