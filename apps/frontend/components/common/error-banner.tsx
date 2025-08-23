"use client";
import {useTranslations} from 'next-intl';
import { DomainError } from '@/lib/api/errors';

interface ErrorBannerProps {
  error?: unknown;
  fallbackKey?: string; // Errors.unknown default
  className?: string;
}

export function ErrorBanner({error, fallbackKey = 'unknown', className=''}: ErrorBannerProps) {
  const t = useTranslations('Errors');
  if (!error) return null;
  const code = (error instanceof DomainError ? error.code : undefined) || fallbackKey;
  // Fallback to provided key if translation missing
  const message = t.has(code) ? t(code) : (t.has(fallbackKey) ? t(fallbackKey) : fallbackKey);
  return (
    <div className={`rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive ${className}`} role="alert">
      <p className="font-semibold mb-1">{t('errorTitle', { fallback: 'Error'})}</p>
      <p>{message}</p>
    </div>
  );
}
