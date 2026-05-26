'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ATSScoreCard } from '@/components/ats/ats-score-card';
import { ATSKeywordTable } from '@/components/ats/ats-keyword-table';
import { ATSMissingKeywords } from '@/components/ats/ats-missing-keywords';
import { screenResume, type ATSScreeningResult } from '@/lib/api/ats';
import { fetchJobDescription } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';

export type AnalysisMode = 'jdmatch' | 'ats';

interface AnalysisPanelProps {
  open: boolean;
  mode: AnalysisMode;
  resumeId: string;
  /** Document tab being analyzed (drives the "Against" line + cache key). */
  documentTab: string;
  /** Display name of the active document (e.g., "Resume", "Cover Letter"). */
  documentLabel: string;
  onClose: () => void;
}

export function AnalysisPanel({
  open,
  mode,
  resumeId,
  documentTab,
  documentLabel,
  onClose,
}: AnalysisPanelProps) {
  const { t } = useTranslations();
  const [result, setResult] = useState<ATSScreeningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noJobDescription, setNoJobDescription] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoJobDescription(false);
    setResult(null);
    try {
      let jobId: string;
      try {
        const jd = await fetchJobDescription(resumeId);
        jobId = jd.job_id;
      } catch {
        setNoJobDescription(true);
        return;
      }
      const data = await screenResume({ resume_id: resumeId, job_id: jobId });
      setResult(data);
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    if (!open) return;
    run();
  }, [open, documentTab, run]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title =
    mode === 'jdmatch' ? t('resumeViewer.panel.jdMatchTitle') : t('resumeViewer.panel.atsTitle');

  return (
    <aside
      className="fixed top-0 right-0 z-40 h-full w-full sm:max-w-[420px] border-l border-black bg-background flex flex-col"
      style={{ boxShadow: '-4px 0 0 0 #000' }}
      role="complementary"
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black bg-background">
        <div className="min-w-0">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] m-0 font-bold">
            {title}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft m-0 mt-1 truncate">
            {t('resumeViewer.panel.againstLabel')} · {documentLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('resumeViewer.panel.closeAria')}
          className="bg-transparent border-none p-1 cursor-pointer text-black hover:bg-paper-tint"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-ink-soft">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] m-0">
              {t('resumeViewer.panel.loading')}
            </p>
          </div>
        )}

        {!loading && noJobDescription && (
          <div className="border border-dashed border-orange-500 bg-background p-5">
            <p className="font-sans text-sm text-ink-soft m-0">
              {mode === 'jdmatch'
                ? t('resumeViewer.panel.jdMatchEmpty')
                : t('resumeViewer.panel.atsEmpty')}
            </p>
          </div>
        )}

        {!loading && error && !noJobDescription && (
          <div className="border border-red-600 bg-red-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-red-700 m-0">
                {t('resumeViewer.panel.errorTitle')}
              </p>
            </div>
            <p className="font-sans text-sm text-red-700 m-0 mb-3">{error}</p>
            <Button size="sm" variant="outline" onClick={run}>
              {t('resumeViewer.panel.retry')}
            </Button>
          </div>
        )}

        {!loading && !error && !noJobDescription && result && (
          <div className="space-y-5">
            {mode === 'ats' && <ATSScoreCard score={result.score} decision={result.decision} />}
            <ATSKeywordTable rows={result.keyword_table} />
            {mode === 'ats' && result.missing_keywords.length > 0 && (
              <ATSMissingKeywords keywords={result.missing_keywords} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
