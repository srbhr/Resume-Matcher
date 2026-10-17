'use client';

import { useMemo } from 'react';
import { type ResumeData } from '@/components/dashboard/resume-component';
import {
  calculateMatchStats,
  extractKeywords,
  resumeKeywordText,
} from '@/lib/utils/keyword-matcher';
import { JDDisplay } from './jd-display';
import { HighlightedResumeView } from './highlighted-resume-view';
import { CheckCircle, Target } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';

interface JDComparisonViewProps {
  jobDescription: string;
  resumeData: ResumeData;
  /** The job's saved keywords, the ones the ATS score counts; null when it has none. */
  jobKeywords: string[] | null;
  /** Hiring company, left out of the fallback word list. */
  company?: string | null;
}

/**
 * Split view comparing job description with resume.
 * Left: JD (read-only)
 * Right: Resume with matching keywords highlighted
 *
 * With saved job keywords the match is the ATS score's keyword match, live on the
 * unsaved draft. Without them it falls back to word overlap with the posting.
 */
export function JDComparisonView({
  jobDescription,
  resumeData,
  jobKeywords,
  company,
}: JDComparisonViewProps) {
  const { t } = useTranslations();

  const keywords = useMemo(
    () => jobKeywords ?? [...extractKeywords(jobDescription, company ?? '')],
    [jobKeywords, jobDescription, company]
  );
  const resumeText = useMemo(() => resumeKeywordText(resumeData), [resumeData]);
  const stats = useMemo(() => calculateMatchStats(resumeText, keywords), [resumeText, keywords]);

  // Keyword match uses the ATS card's bands; word overlap runs lower, so it keeps its own.
  const [high, mid] = jobKeywords ? [80, 60] : [50, 30];

  return (
    <div className="h-full flex flex-col">
      {/* Stats Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-paper">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Target aria-hidden="true" className="size-4 text-primary" />
            <span className="text-sm font-mono tabular-nums">
              {jobKeywords
                ? t('builder.jdMatch.stats.jobKeywords', { count: stats.totalKeywords })
                : t('builder.jdMatch.stats.keywordsExtracted', { count: stats.totalKeywords })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle aria-hidden="true" className="size-4 text-success" />
            <span className="text-sm font-mono tabular-nums">
              {t('builder.jdMatch.stats.matchesFound', { count: stats.matchCount })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-ink-soft">
            {jobKeywords
              ? t('builder.jdMatch.stats.keywordMatchLabel')
              : t('builder.jdMatch.stats.wordOverlapLabel')}
          </span>
          <span
            className={`text-lg font-bold tabular-nums ${
              stats.matchPercentage >= high
                ? 'text-success'
                : stats.matchPercentage >= mid
                  ? 'text-warning-text'
                  : 'text-destructive'
            }`}
          >
            {stats.matchPercentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* Left: JD */}
        <div className="border-r border-paper overflow-hidden">
          <JDDisplay content={jobDescription} />
        </div>

        {/* Right: Resume with highlights */}
        <div className="overflow-hidden">
          <HighlightedResumeView resumeData={resumeData} keywords={keywords} />
        </div>
      </div>
    </div>
  );
}
