'use client';

import { SpinnerGap } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { useTranslations } from '@/lib/i18n';

interface LoadingStepProps {
  message: string;
  submessage?: string;
}

function LoadingStep({ message, submessage }: LoadingStepProps) {
  return (
    <div role="status" className="flex flex-col items-start gap-2 py-6">
      <p className="flex items-center gap-3 font-mono text-sm font-bold uppercase tracking-wider text-ink">
        <SpinnerGap aria-hidden="true" className="size-5 shrink-0 animate-spin" />
        {message}
      </p>
      {submessage && <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">{submessage}</p>}
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
  onClose: () => void | Promise<void>;
  updatedCount?: number;
  refreshFailed?: boolean;
  isRefreshing?: boolean;
}

export function CompleteStep({
  onClose,
  updatedCount,
  refreshFailed = false,
  isRefreshing = false,
}: CompleteStepProps) {
  const { t } = useTranslations();
  const hasUpdatedCount = updatedCount !== undefined;
  return (
    <div className="flex flex-col items-start gap-4 py-6">
      <StatusIndicator tone="ready">{t('enrichment.complete.title')}</StatusIndicator>
      <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">
        {hasUpdatedCount
          ? updatedCount === 1
            ? t('enrichment.complete.updatedCountSingular', { count: updatedCount })
            : t('enrichment.complete.updatedCountPlural', { count: updatedCount })
          : t('enrichment.complete.updatedFallback')}
      </p>
      {refreshFailed && (
        <Alert
          tone="warning"
          className="max-w-md"
          title={t('enrichment.complete.refreshFailedTitle')}
        >
          {t('enrichment.complete.refreshFailed')}
        </Alert>
      )}
      <Button onClick={onClose} disabled={isRefreshing}>
        {isRefreshing && <SpinnerGap aria-hidden="true" className="animate-spin" />}
        {isRefreshing
          ? t('enrichment.complete.refreshing')
          : refreshFailed
            ? t('enrichment.complete.retryRefresh')
            : t('enrichment.complete.doneButton')}
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
    <div className="flex flex-col items-start gap-4 py-6">
      <StatusIndicator tone="ready">{t('enrichment.noImprovements.title')}</StatusIndicator>
      <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">
        {summary || t('enrichment.noImprovements.defaultDescription')}
      </p>
      <Button onClick={onClose}>{t('common.close')}</Button>
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
    <div className="flex flex-col items-start gap-4 py-6">
      <StatusIndicator tone="error">{t('enrichment.error.title')}</StatusIndicator>
      <Alert tone="error" className="max-w-md">
        {error}
      </Alert>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onRetry}>{t('common.retry')}</Button>
      </div>
    </div>
  );
}
