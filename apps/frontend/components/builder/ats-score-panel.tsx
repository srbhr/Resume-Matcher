'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, SpinnerGap } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import { fetchLastAtsScore, recalculateAtsScore, type ATSScoreRecord } from '@/lib/api/resume';
import type { TemplateType } from '@/lib/types/template-settings';
import { ATSScoreCard } from '@/components/tailor/ats-score-card';

interface AtsScorePanelProps {
  resumeId: string;
  /** Recalculation scores the saved resume, so it waits until edits are saved. */
  hasUnsavedChanges: boolean;
  template?: TemplateType;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; record: ATSScoreRecord | null }
  | { status: 'failed' };

/** Last calculated ATS score of a tailored resume, with on-demand recalculation. */
export function AtsScorePanel({ resumeId, hasUnsavedChanges, template }: AtsScorePanelProps) {
  const { t, locale } = useTranslations();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateFailed, setRecalculateFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLastScore = async () => {
      setState({ status: 'loading' });
      setRecalculateFailed(false);
      try {
        const record = await fetchLastAtsScore(resumeId);
        if (!cancelled) setState({ status: 'loaded', record });
      } catch (err) {
        if (!cancelled) {
          console.warn('Could not load ATS score:', err);
          setState({ status: 'failed' });
        }
      }
    };

    loadLastScore();
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setRecalculateFailed(false);
    try {
      const record = await recalculateAtsScore(resumeId);
      setState({ status: 'loaded', record });
    } catch (err) {
      // Older tailored resumes may have no analyzed job keywords to score against.
      console.warn('Could not recalculate ATS score:', err);
      setRecalculateFailed(true);
    } finally {
      setRecalculating(false);
    }
  };

  const loading = state.status === 'loading';
  const record = state.status === 'loaded' ? state.record : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 border-2 border-ink bg-white p-4">
        <div className="min-w-0 space-y-1">
          {/* Job-match score; the ATS CHECK tab is the separate parse check. */}
          <p className="text-sm text-ink-soft">{t('builder.jdMatch.atsScore.description')}</p>
          <p className="font-mono text-xs uppercase text-steel">
            {loading
              ? t('builder.jdMatch.atsScore.loading')
              : record
                ? t('builder.jdMatch.atsScore.lastCalculated', {
                    date: new Date(record.calculated_at).toLocaleString(locale),
                  })
                : null}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRecalculate}
          disabled={loading || recalculating || hasUnsavedChanges}
        >
          {recalculating ? (
            <SpinnerGap aria-hidden="true" className="animate-spin" />
          ) : (
            <ArrowsClockwise aria-hidden="true" />
          )}
          {recalculating
            ? t('builder.jdMatch.atsScore.recalculating')
            : t('builder.jdMatch.atsScore.recalculate')}
        </Button>
      </div>

      {hasUnsavedChanges && (
        <Alert tone="warning" role="status">
          {t('builder.jdMatch.atsScore.saveFirst')}
        </Alert>
      )}
      {recalculateFailed && (
        <Alert tone="error">{t('builder.jdMatch.atsScore.recalculateFailed')}</Alert>
      )}
      {state.status === 'failed' && (
        <Alert tone="error">{t('builder.jdMatch.atsScore.loadFailed')}</Alert>
      )}

      {record ? (
        <ATSScoreCard atsScore={record.score} template={template} />
      ) : (
        state.status === 'loaded' && (
          <p className="text-sm text-ink-soft">{t('builder.jdMatch.atsScore.notCalculated')}</p>
        )
      )}
    </div>
  );
}
