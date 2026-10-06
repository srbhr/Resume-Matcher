'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  checkResumeParse,
  type ParseCheck,
  type ParseCheckReport,
  type ParseCheckStatus,
} from '@/lib/api/ats';
import { useTranslations } from '@/lib/i18n';
import { type TemplateSettings } from '@/lib/types/template-settings';
import { cn } from '@/lib/utils';

interface AtsCheckViewProps {
  resumeId: string | null;
  settings: TemplateSettings;
  locale?: string;
  hasUnsavedChanges?: boolean;
}

const STATUS_STYLES: Record<ParseCheckStatus, { square: string; text: string }> = {
  pass: { square: 'bg-green-700', text: 'text-green-700' },
  warn: { square: 'bg-orange-500', text: 'text-orange-500' },
  fail: { square: 'bg-red-600', text: 'text-red-600' },
};

const SECTION_KIND_PARAMS = new Set(['found', 'missing']);

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-black bg-white p-4 space-y-3">
      <h3 className="font-mono text-sm font-bold uppercase tracking-wider border-b border-black/10 pb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StatusLabel({ status, label }: { status: ParseCheckStatus; label: string }) {
  return (
    <span className="flex items-center gap-2 shrink-0">
      <span className={cn('w-3 h-3', STATUS_STYLES[status].square)} />
      <span className={cn('font-mono text-xs font-bold uppercase', STATUS_STYLES[status].text)}>
        {label}
      </span>
    </span>
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
      <div className="flex items-center justify-between gap-4 border-2 border-black bg-white p-4">
        <p className="font-mono text-xs uppercase text-steel-grey">
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

      {!resumeId && (
        <p className="border-2 border-orange-500 bg-orange-50 p-4 text-sm" role="alert">
          {t('builder.atsCheck.saveFirst')}
        </p>
      )}
      {resumeId && hasUnsavedChanges && (
        <p className="border-2 border-orange-500 bg-orange-50 p-4 text-sm">
          {t('builder.atsCheck.unsavedNotice')}
        </p>
      )}
      {error && (
        <p className="border-2 border-red-600 bg-red-50 p-4 text-sm text-red-600" role="alert">
          {t('builder.atsCheck.error')}
        </p>
      )}

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
              <div key={key} className="border-2 border-black bg-white p-4">
                <p className="font-mono text-xs font-bold uppercase text-steel-grey">
                  {t(`builder.atsCheck.${key}`)}
                </p>
                <p className="font-serif text-4xl font-bold">
                  {value}
                  <span className="text-lg text-steel-grey">/100</span>
                </p>
              </div>
            ))}
          </div>
          <p className="font-mono text-xs uppercase">
            {t(`builder.atsCheck.extractability.${report.extractability}`)}
          </p>

          <Box title={t('builder.atsCheck.checksTitle')}>
            <ul className="divide-y divide-black/10">
              {report.checks.map((check) => (
                <li key={check.id} className="flex gap-4 py-3" data-check={check.id}>
                  <StatusLabel
                    status={check.status}
                    label={t(`builder.atsCheck.status.${check.status}`)}
                  />
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
