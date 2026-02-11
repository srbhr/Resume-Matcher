'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { fetchLlmApiKey, updateLlmApiKey } from '@/lib/api/config';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

const MASK_THRESHOLD = 6;

export default function ApiKeyMenu(): React.ReactElement {
  const { t } = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [apiKey, setApiKey] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await fetchLlmApiKey();
        if (cancelled) return;
        setApiKey(value);
        setDraft(value);
        setStatus('idle');
      } catch (err) {
        console.error('Failed to load LLM API key', err);
        if (!cancelled) {
          setError(t('settings.apiKeyMenu.loadError'));
          setStatus('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const maskedKey = useMemo(() => {
    if (!apiKey) return t('settings.statusValues.notSet');
    if (apiKey.length <= MASK_THRESHOLD) return apiKey;
    return `${apiKey.slice(0, MASK_THRESHOLD)}••••`;
  }, [apiKey, t]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!prev) {
        setDraft(apiKey);
        setError(null);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      const trimmed = draft.trim();
      const saved = await updateLlmApiKey(trimmed);
      setApiKey(saved);
      setDraft(saved);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch (err) {
      console.error('Failed to update LLM API key', err);
      setError((err as Error).message || t('settings.apiKeyMenu.updateError'));
      setStatus('error');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setDraft(apiKey);
    setError(null);
  };

  return (
    <div className="relative text-sm">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-2 rounded-none border-2 border-black bg-white px-3 py-2 text-black shadow-[2px_2px_0px_0px_#000000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
      >
        <span className="font-semibold">{t('settings.apiKeyMenu.buttonLabel')}</span>
        <span className="font-mono text-xs text-gray-600">{maskedKey}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {isOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-none border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000000]">
            <h3 className="font-serif text-base font-semibold text-black mb-2">
              {t('settings.apiKeyMenu.title')}
            </h3>
            <p className="text-xs text-gray-600 mb-3">{t('settings.apiKeyMenu.description')}</p>
            <label
              htmlFor="llmKey"
              className="font-mono text-xs font-medium uppercase tracking-wider text-gray-600"
            >
              {t('settings.apiKey')}
            </label>
            <input
              id="llmKey"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('settings.llmConfiguration.apiKeyPlaceholder')}
              className="mt-1 w-full rounded-none border-2 border-black bg-[#F0F0E8] px-3 py-2 text-sm text-black focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
            />
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-none border-2 border-black px-3 py-2 text-xs font-semibold text-black hover:bg-[#F0F0E8]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={status === 'saving'}
                className={`rounded-none border-2 border-black px-4 py-2 text-xs font-semibold transition-all ${
                  status === 'saving'
                    ? 'bg-gray-300 text-gray-600 cursor-wait'
                    : 'bg-blue-700 text-white shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
                }`}
              >
                {status === 'saving' ? t('common.saving') : t('common.save')}
              </button>
            </div>
            {status === 'saved' ? (
              <p className="mt-2 text-xs text-green-700 font-medium">
                {t('settings.apiKeyMenu.savedMessage')}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
