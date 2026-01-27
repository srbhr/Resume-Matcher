'use client';

import { Loader2, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

interface LoadingStepProps {
  message: string;
  submessage?: string;
}

function LoadingStep({ message, submessage }: LoadingStepProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <Loader2 className="w-12 h-12 animate-spin text-black" />
      </div>
      <div className="text-center">
        <p className="text-xl font-mono font-bold">{message}</p>
        {submessage && <p className="text-sm text-gray-500 mt-2 font-mono">{submessage}</p>}
      </div>
    </div>
  );
}

export function AnalyzingStep() {
  const { t } = useTranslations();
  return (
    <LoadingStep
      message={t('enrichment.loading.analyzingTitle')}
      submessage={t('enrichment.loading.analyzingDescription')}
    />
  );
}

export function GeneratingStep() {
  const { t } = useTranslations();
  return (
    <LoadingStep
      message={t('enrichment.loading.generatingTitle')}
      submessage={t('enrichment.loading.generatingDescription')}
    />
  );
}

export function ApplyingStep() {
  const { t } = useTranslations();
  return (
    <LoadingStep
      message={t('enrichment.loading.applyingTitle')}
      submessage={t('enrichment.loading.applyingDescription')}
    />
  );
}

interface CompleteStepProps {
  onClose: () => void;
  updatedCount?: number;
}

export function CompleteStep({ onClose, updatedCount }: CompleteStepProps) {
  const { t } = useTranslations();
  const hasUpdatedCount = updatedCount !== undefined;
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
      </div>
      <div className="text-center">
        <p className="text-2xl font-mono font-bold">{t('enrichment.complete.title')}</p>
        <p className="text-sm text-gray-500 mt-2 font-mono">
          {hasUpdatedCount
            ? updatedCount === 1
              ? t('enrichment.complete.updatedCountSingular', { count: updatedCount })
              : t('enrichment.complete.updatedCountPlural', { count: updatedCount })
            : t('enrichment.complete.updatedFallback')}
        </p>
      </div>
      <Button onClick={onClose} className="mt-4 gap-2">
        <Sparkles className="w-4 h-4" />
        {t('enrichment.complete.doneButton')}
      </Button>
    </div>
  );
}

interface NoImprovementsStepProps {
  onClose: () => void;
  summary?: string;
}

export function NoImprovementsStep({ onClose, summary }: NoImprovementsStepProps) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
      </div>
      <div className="text-center max-w-md">
        <p className="text-2xl font-mono font-bold">{t('enrichment.noImprovements.title')}</p>
        <p className="text-sm text-gray-500 mt-2 font-mono">
          {summary || t('enrichment.noImprovements.defaultDescription')}
        </p>
      </div>
      <Button onClick={onClose} className="mt-4 gap-2">
        <Sparkles className="w-4 h-4" />
        {t('common.close')}
      </Button>
    </div>
  );
}

interface ErrorStepProps {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}

export function ErrorStep({ error, onRetry, onClose }: ErrorStepProps) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <AlertCircle className="w-16 h-16 text-red-500" />
      </div>
      <div className="text-center max-w-md">
        <p className="text-xl font-mono font-bold">{t('enrichment.error.title')}</p>
        <p className="text-sm text-red-600 mt-2 font-mono bg-red-50 p-3 border border-red-200">
          {error}
        </p>
      </div>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onRetry}>{t('common.retry')}</Button>
      </div>
    </div>
  );
}
