'use client';

import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import {
  checkResumeParse,
  type ParseCheck,
  type ParseCheckReport,
  type ParseCheckStatus,
} from '@/lib/api/ats';
import { useTranslations } from '@/lib/i18n';
import { type TemplateSettings } from '@/lib/types/template-settings';

interface AtsCheckViewProps {
  resumeId: string | null;
  settings: TemplateSettings;
  locale?: string;
  hasUnsavedChanges?: boolean;
}

const STATUS_TONE: Record<ParseCheckStatus, StatusTone> = {
  pass: 'ready',
  warn: 'warning',
  fail: 'error',
};

const SECTION_KIND_PARAMS = new Set(['found', 'missing']);

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-ink bg-white p-4 space-y-3">
      <div className="border-b border-panel-hover pb-2">
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AtsCheckView({
  resumeId,
  settings,
  locale,
  hasUnsavedChanges = false,
}: AtsCheckViewProps) {
  const { t } = useTranslations();
  const [report, setReport] = React.useState<ParseCheckReport | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState(false);

  const run = async () => {
    if (!resumeId) return;
    setRunning(true);
    setError(false);
    try {
      setReport(await checkResumeParse(resumeId, settings, locale));
    } catch (e) {
      console.error('Parse check failed:', e);
      setError(true);
    } finally {
      setRunning(false);
    }
  };

  const formatParams = (check: ParseCheck): Record<string, string | number> => {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(check.params)) {
      if (Array.isArray(value)) {
        params[key] = SECTION_KIND_PARAMS.has(key)
          ? value.map((kind) => t(`builder.atsCheck.sectionKinds.${kind}`)).join(', ')
          : value.join(', ');
      } else if (typeof value === 'number' || typeof value === 'string') {
        params[key] = value;
      }
    }
    return params;
  };

  const problemFields = report?.roundtrip?.fields.filter((f) => f.status !== 'found') ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 border-2 border-ink bg-white p-4">
        <p className="font-mono text-xs uppercase text-steel">
          {t('builder.atsCheck.templateLabel', { template: settings.template })}
        </p>
        <Button onClick={run} disabled={!resumeId || running} size="sm">
          {running
            ? t('builder.atsCheck.running')
            : report
              ? t('builder.atsCheck.rerunButton')
              : t('builder.atsCheck.runButton')}
        </Button>
      </div>

      {!resumeId && <Alert tone="warning">{t('builder.atsCheck.saveFirst')}</Alert>}
      {resumeId && hasUnsavedChanges && (
        <Alert tone="warning" role="status">
          {t('builder.atsCheck.unsavedNotice')}
        </Alert>
      )}
      {error && <Alert tone="error">{t('builder.atsCheck.error')}</Alert>}

      {!report && !error && resumeId && (
        <p className="text-sm text-ink-soft">{t('builder.atsCheck.emptyState')}</p>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ['parseability', report.overall_score],
                ['content', report.content_score],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="border-2 border-ink bg-white p-4">
                <p className="font-mono text-xs font-bold uppercase text-steel">
                  {t(`builder.atsCheck.${key}`)}
                </p>
                <p className="font-serif text-4xl font-bold">
                  {value}
                  <span className="text-lg text-steel">/100</span>
                </p>
              </div>
            ))}
          </div>
          <p className="font-mono text-xs uppercase">
            {t(`builder.atsCheck.extractability.${report.extractability}`)}
          </p>

          <Box title={t('builder.atsCheck.checksTitle')}>
            <ul className="divide-y divide-panel-hover">
              {report.checks.map((check) => (
                <li key={check.id} className="flex gap-4 py-3" data-check={check.id}>
                  <StatusIndicator tone={STATUS_TONE[check.status]} className="shrink-0 self-start">
                    {t(`builder.atsCheck.status.${check.status}`)}
                  </StatusIndicator>
                  <div className="space-y-1">
                    <p className="font-bold text-sm">
                      {t(`builder.atsCheck.checks.${check.id}.title`)}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {t(
                        `builder.atsCheck.checks.${check.id}.${check.status}`,
                        formatParams(check)
                      )}
                    </p>
                    {check.id === 'multi_column' &&
                      check.status !== 'pass' &&
                      check.params.expected_by_template === true && (
                        <p className="text-sm text-ink-soft">
                          {t('builder.atsCheck.checks.multi_column.templateHint')}
                        </p>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          </Box>

          {report.roundtrip && (
            <Box title={t('builder.atsCheck.roundTripTitle')}>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                <p>
                  {t('builder.atsCheck.contentRecall')}:{' '}
                  <strong>{percent(report.roundtrip.content_recall)}</strong>
                </p>
                <p>
                  {t('builder.atsCheck.orderFidelity')}:{' '}
                  <strong>{percent(report.roundtrip.order_fidelity)}</strong>
                </p>
              </div>
              {problemFields.length === 0 ? (
                <p className="text-sm text-ink-soft">{t('builder.atsCheck.allFieldsFound')}</p>
              ) : (
                <ul className="space-y-1">
                  {problemFields.map((field) => (
                    <li key={field.field} className="flex justify-between gap-4 text-xs">
                      <span className="font-mono break-all">{field.field}</span>
                      <span className="font-mono font-bold uppercase shrink-0">
                        {t(`builder.atsCheck.fieldStatus.${field.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Box>
          )}

          <Box title={t('builder.atsCheck.previewTitle')}>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
              {report.extracted_text_preview}
            </pre>
          </Box>
        </>
      )}
    </div>
  );
}
