'use client';

import React from 'react';
import {
  ArrowsClockwise,
  Briefcase,
  Clock,
  Database,
  FileText,
  HardDrives,
  SpinnerGap,
} from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/ui/status-indicator';
import type { SystemStatus } from '@/lib/api/config';
import { useTranslations } from '@/lib/i18n';

interface StatusStripProps {
  status: SystemStatus | null;
  loading: boolean;
  /** "Just now", "2m ago": when the status was last read, if it has been. */
  lastFetched: string | null;
  apiUrl: string;
  onRefresh: () => void;
}

/** One cell of the strip: a mono label over its value. */
function Cell({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas px-6 py-3">
      <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase text-steel">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

const COUNT = 'font-mono text-2xl font-bold tabular-nums text-ink';

/**
 * System status as one ruled row under the Settings header, drawn like the
 * dashboard grid (cells on an ink ground): LLM, database, resumes, jobs,
 * improvements, master resume. It stays in view whichever section is open.
 */
export function StatusStrip({ status, loading, lastFetched, apiUrl, onRefresh }: StatusStripProps) {
  const { t } = useTranslations();
  const icon = 'size-4';

  return (
    <section aria-labelledby="settings-status-heading" className="shrink-0 border-b border-ink">
      <div className="flex items-center justify-between gap-4 px-6 py-2">
        <div className="flex items-center gap-3">
          <h2
            id="settings-status-heading"
            className="whitespace-nowrap font-serif text-base font-bold text-ink"
          >
            {t('settings.systemStatus.title')}
          </h2>
          {lastFetched && (
            <span className="flex items-center gap-1 whitespace-nowrap font-mono text-xs text-steel">
              <Clock aria-hidden="true" className={icon} />
              {lastFetched}
            </span>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <ArrowsClockwise aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
          {t('settings.systemStatus.refresh')}
        </Button>
      </div>

      {loading && !status ? (
        <div role="status" className="flex items-center gap-2 border-t border-ink px-6 py-4">
          <SpinnerGap aria-hidden="true" className="size-4 animate-spin text-steel" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : !status ? (
        <div className="border-t border-ink px-6 py-3">
          <Alert tone="error" title={t('settings.systemStatus.unableToConnect')}>
            <p>{t('settings.systemStatus.expectedAt', { apiUrl })}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="mt-3">
              <ArrowsClockwise aria-hidden="true" />
              {t('common.retry')}
            </Button>
          </Alert>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px border-t border-ink bg-ink sm:grid-cols-3 xl:grid-cols-6">
          <Cell
            icon={<HardDrives aria-hidden="true" className={icon} />}
            label={t('settings.statusCards.llm')}
          >
            <StatusIndicator tone={status.llm_healthy ? 'ready' : 'error'}>
              {status.llm_healthy
                ? t('settings.statusValues.healthy')
                : t('settings.statusValues.offline')}
            </StatusIndicator>
          </Cell>
          <Cell
            icon={<Database aria-hidden="true" className={icon} />}
            label={t('settings.statusCards.database')}
          >
            <StatusIndicator tone="ready">{t('settings.statusValues.connected')}</StatusIndicator>
          </Cell>
          <Cell
            icon={<FileText aria-hidden="true" className={icon} />}
            label={t('settings.statusCards.resumes')}
          >
            <span className={COUNT}>{status.database_stats.total_resumes}</span>
          </Cell>
          <Cell
            icon={<Briefcase aria-hidden="true" className={icon} />}
            label={t('settings.statusCards.jobs')}
          >
            <span className={COUNT}>{status.database_stats.total_jobs}</span>
          </Cell>
          <Cell label={t('settings.statusCards.improvements')}>
            <span className={COUNT}>{status.database_stats.total_improvements}</span>
          </Cell>
          <Cell
            icon={<FileText aria-hidden="true" className={icon} />}
            label={t('settings.statusCards.masterResume')}
          >
            {status.has_master_resume ? (
              <StatusIndicator tone="ready">
                {t('settings.statusValues.configured')}
              </StatusIndicator>
            ) : (
              <StatusIndicator tone="warning">{t('settings.statusValues.notSet')}</StatusIndicator>
            )}
          </Cell>
        </div>
      )}
    </section>
  );
}
