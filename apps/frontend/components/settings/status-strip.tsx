'use client';

import React from 'react';
import { ArrowsClockwise, SpinnerGap } from '@phosphor-icons/react';
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

const CELL = 'flex flex-wrap items-center gap-x-2 gap-y-1 bg-canvas px-6 py-3';

/** One cell of the band: a mono label and its value on one line. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={CELL}>
      <span className="whitespace-nowrap font-mono text-xs uppercase text-steel">{label}</span>
      {children}
    </div>
  );
}

/**
 * System status as one ruled band under the Settings header, on the same six columns
 * as the menu and section below it: the label (over the menu column), LLM, database,
 * master resume, when it was read, and Refresh. It stays in view whichever section is
 * open. The counts of what the app holds are in About.
 */
export function StatusStrip({ status, loading, lastFetched, apiUrl, onRefresh }: StatusStripProps) {
  const { t } = useTranslations();

  return (
    <section aria-labelledby="settings-status-heading" className="shrink-0 border-b border-ink">
      <div className="grid grid-cols-2 gap-px bg-ink sm:grid-cols-3 xl:grid-cols-6">
        <div className={CELL}>
          <h2
            id="settings-status-heading"
            className="whitespace-nowrap font-serif text-base font-bold text-ink"
          >
            {t('settings.systemStatus.title')}
          </h2>
        </div>
        {status ? (
          <>
            <Cell label={t('settings.statusCards.llm')}>
              <StatusIndicator tone={status.llm_healthy ? 'ready' : 'error'}>
                {status.llm_healthy
                  ? t('settings.statusValues.healthy')
                  : t('settings.statusValues.offline')}
              </StatusIndicator>
            </Cell>
            <Cell label={t('settings.statusCards.database')}>
              <StatusIndicator tone="ready">{t('settings.statusValues.connected')}</StatusIndicator>
            </Cell>
            <Cell label={t('settings.statusCards.masterResume')}>
              {status.has_master_resume ? (
                <StatusIndicator tone="ready">
                  {t('settings.statusValues.configured')}
                </StatusIndicator>
              ) : (
                <StatusIndicator tone="warning">
                  {t('settings.statusValues.notSet')}
                </StatusIndicator>
              )}
            </Cell>
            <Cell label={t('settings.systemStatus.updated')}>
              <span className="font-mono text-xs text-ink">
                {lastFetched ?? t('settings.systemStatus.lastFetched.never')}
              </span>
            </Cell>
            <div className="flex items-center bg-canvas px-4 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
              >
                <ArrowsClockwise
                  aria-hidden="true"
                  className={loading ? 'animate-spin' : undefined}
                />
                {t('settings.systemStatus.refresh')}
              </Button>
            </div>
          </>
        ) : (
          <div className="col-span-1 flex items-center bg-canvas px-6 py-3 sm:col-span-2 xl:col-span-5">
            {loading && (
              <span role="status" className="flex items-center">
                <SpinnerGap aria-hidden="true" className="size-4 animate-spin text-steel" />
                <span className="sr-only">{t('common.loading')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {!status && !loading && (
        <div className="border-t border-ink px-6 py-3">
          <Alert tone="error" title={t('settings.systemStatus.unableToConnect')}>
            <p>{t('settings.systemStatus.expectedAt', { apiUrl })}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="mt-3">
              <ArrowsClockwise aria-hidden="true" />
              {t('common.retry')}
            </Button>
          </Alert>
        </div>
      )}
    </section>
  );
}
