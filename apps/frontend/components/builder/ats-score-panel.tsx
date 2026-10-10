'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
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

  if (state.status === 'loading') {
    return (
      <div className="border-2 border-black bg-white p-4 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-ink-soft">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('builder.jdMatch.atsScore.loading')}
      </div>
    );
  }

  const record = state.status === 'loaded' ? state.record : null;

  return (
    <div className="space-y-2">
      {record ? (
        <ATSScoreCard atsScore={record.score} template={template} />
      ) : (
        <div className="border-2 border-black bg-white p-4 font-mono text-xs text-ink-soft">
          {state.status === 'failed'
            ? t('builder.jdMatch.atsScore.loadFailed')
            : t('builder.jdMatch.atsScore.notCalculated')}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-ink-soft">
          {record &&
            t('builder.jdMatch.atsScore.lastCalculated', {
              date: new Date(record.calculated_at).toLocaleString(locale),
            })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculating || hasUnsavedChanges}
          className="gap-2"
        >
          {recalculating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {recalculating
            ? t('builder.jdMatch.atsScore.recalculating')
            : t('builder.jdMatch.atsScore.recalculate')}
        </Button>
      </div>

      {hasUnsavedChanges && (
        <p className="font-mono text-xs text-ink-soft">{t('builder.jdMatch.atsScore.saveFirst')}</p>
      )}
      {recalculateFailed && (
        <p className="font-mono text-xs text-destructive">
          {t('builder.jdMatch.atsScore.recalculateFailed')}
        </p>
      )}
    </div>
  );
}
