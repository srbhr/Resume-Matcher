'use client';

import { useEffect, useRef, useState } from 'react';
import { PencilSimpleLine, SpinnerGap } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { TailorProgress } from '@/components/tailor/tailor-progress';
import { WritingScoreCard } from '@/components/tailor/writing-score-card';
import { newProgressId, subscribeToProgress } from '@/lib/api/progress';
import {
  checkWriting,
  improveWriting,
  type WritingImproveResult,
  type WritingReport,
} from '@/lib/api/writing';
import { useOptionalStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import { locatePath } from '@/lib/utils/resume-paths';

const CHECK_DEBOUNCE_MS = 800;

interface WritingPanelProps {
  resumeData: ResumeData;
  /** Puts the accepted rewrite into the editor (it then saves like any edit). */
  onApply: (data: ResumeData) => void;
  /** In agent mode the agent rewrites: the button asks for a prompt instead. */
  agentMode: boolean;
  onAgentPrompt: () => void;
}

/** Writing score for the resume being edited, and the Improve writing action. */
export function WritingPanel({ resumeData, onApply, agentMode, onAgentPrompt }: WritingPanelProps) {
  const { t } = useTranslations();
  // Without an AI provider Improve writing is unavailable (unknown status: allow and report errors).
  const statusCache = useOptionalStatusCache();
  const canImprove = statusCache?.status ? Boolean(statusCache.status.llm_configured) : true;
  const [report, setReport] = useState<WritingReport | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [improving, setImproving] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [proposal, setProposal] = useState<WritingImproveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The resume the proposal was made from; applying it over later edits would lose them.
  const requestedFrom = useRef<string | null>(null);
  const currentJson = JSON.stringify(resumeData);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      checkWriting(resumeData).then(
        (next) => {
          if (cancelled) return;
          setReport(next);
          setCheckFailed(false);
        },
        (err) => {
          console.error('Writing check failed:', err);
          if (!cancelled) setCheckFailed(true);
        }
      );
    }, CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resumeData]);

  useEffect(() => {
    if (!improving) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [improving]);

  const handleImprove = async () => {
    if (agentMode) {
      onAgentPrompt();
      return;
    }
    setImproving(true);
    setError(null);
    setProposal(null);
    setStage(null);
    requestedFrom.current = currentJson;
    const progressId = newProgressId();
    const stop = subscribeToProgress(progressId, setStage);
    try {
      setProposal(await improveWriting(resumeData, progressId));
    } catch (err) {
      console.error('Improve writing failed:', err);
      setError(t('builder.writing.error'));
    } finally {
      stop();
      setImproving(false);
    }
  };

  const handleApply = () => {
    if (!proposal) return;
    if (requestedFrom.current !== currentJson) {
      setError(t('builder.writing.changedMeanwhile'));
      setProposal(null);
      return;
    }
    onApply(proposal.improved_data);
    setProposal(null);
  };

  const where = (path: string) => {
    const location = locatePath(resumeData, path);
    if (location.kind === 'summary') return t('tailor.forceKeywords.where.summary');
    if (location.kind === 'bullet')
      return t('tailor.forceKeywords.where.bullet', { entry: location.entry, line: location.line });
    return path;
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-ink bg-white p-4">
        <h3 className="mb-2 font-mono text-sm font-bold uppercase">
          {t('builder.writing.aboutTitle')}
        </h3>
        <p className="text-sm leading-relaxed text-ink-soft">
          {t('builder.writing.aboutDescription')}
        </p>
        <Button
          className="mt-4"
          onClick={() => void handleImprove()}
          disabled={improving || (!agentMode && !canImprove)}
        >
          {improving ? (
            <SpinnerGap className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PencilSimpleLine className="size-4" aria-hidden="true" />
          )}
          {improving ? t('builder.writing.improving') : t('builder.writing.improve')}
        </Button>
        {!agentMode && !canImprove && (
          <p className="mt-2 text-sm text-ink-soft">{t('builder.writing.needsProvider')}</p>
        )}
      </div>

      {improving && (
        <TailorProgress
          stage={stage}
          elapsed={elapsed}
          withSelection={false}
          withRewrite
          steps={['critique', 'rewrite', 'verify']}
        />
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {proposal && (
        <section
          aria-labelledby="writing-proposal-heading"
          className="space-y-3 border-2 border-ink bg-white p-4"
        >
          <h3
            id="writing-proposal-heading"
            className="font-mono text-sm font-bold uppercase tracking-wider"
          >
            {t('builder.writing.reviewTitle')}
          </h3>
          {proposal.changes.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('builder.writing.noChanges')}</p>
          ) : (
            <ul className="space-y-3">
              {proposal.changes.map((change) => (
                <li key={change.path} className="border border-ink bg-info-tint p-3">
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">
                    {where(change.path)}
                  </p>
                  <del className="mt-1 block text-sm text-destructive line-through">
                    {change.before}
                  </del>
                  <ins className="block text-sm text-ink no-underline">{change.after}</ins>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-soft">{t('builder.writing.applyNote')}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setProposal(null)}>
              {t('builder.writing.discard')}
            </Button>
            <Button
              variant="success"
              onClick={handleApply}
              disabled={proposal.changes.length === 0}
            >
              {t('builder.writing.applyChanges')}
            </Button>
          </div>
        </section>
      )}

      {proposal ? (
        <WritingScoreCard writing={proposal.writing} resume={proposal.improved_data} />
      ) : report ? (
        <WritingScoreCard writing={report} resume={resumeData} />
      ) : checkFailed ? (
        <Alert tone="error">{t('builder.writing.checkError')}</Alert>
      ) : null}
    </div>
  );
}
